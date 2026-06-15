"""BullMQ worker adapter (Anhang E.1 / §12.2 Queue).

Thin glue around the pure :func:`parse_document_set` pipeline: it deserialises a
job, runs the parse, and returns the camelCase result the TypeScript document
service consumes. All real logic lives in the pipeline so this stays testable
without a running Redis (``handle_parse_job`` needs no BullMQ import).
"""

from __future__ import annotations

import os
from typing import Any

import structlog

from parser_worker.models import ParseJobInput, ParseStatus
from parser_worker.pipeline import FileResolver, parse_document_set

log = structlog.get_logger()

PARSE_QUEUE_NAME = os.environ.get("PARSE_QUEUE_NAME", "document-parse")
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")


def handle_parse_job(
    data: dict[str, Any], *, resolver: FileResolver | None = None
) -> dict[str, Any]:
    """Run one parse job. Returns the camelCase ParseJobResult dict."""
    job_input = ParseJobInput.model_validate(data)
    result = (
        parse_document_set(job_input, resolver=resolver)
        if resolver is not None
        else parse_document_set(job_input)
    )
    log.info(
        "parser.job_completed",
        document_set_id=result.document_set_id,
        status=result.status.value,
        parse_confidence=result.parse_confidence,
        warnings=len(result.warnings),
    )
    if result.status is ParseStatus.NEEDS_REVIEW:
        log.warning(
            "parser.needs_review",
            document_set_id=result.document_set_id,
            parse_confidence=result.parse_confidence,
        )
    return result.model_dump(by_alias=True)


async def run_worker(
    queue_name: str = PARSE_QUEUE_NAME, redis_url: str = REDIS_URL
) -> None:
    """Start the BullMQ worker and block until cancelled."""
    import asyncio

    from bullmq import Worker

    async def processor(job: Any, _token: str) -> dict[str, Any]:
        return handle_parse_job(job.data)

    worker = Worker(queue_name, processor, {"connection": redis_url})
    log.info("parser.worker_started", queue=queue_name)
    try:
        await asyncio.Event().wait()  # run until the process is signalled
    finally:
        await worker.close()
        log.info("parser.worker_stopped", queue=queue_name)
