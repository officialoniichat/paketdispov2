"""Entry point: consume the Redis/BullMQ document-parse queue (§12.2 / E.1)."""

import asyncio

import structlog

from parser_worker.queue import PARSE_QUEUE_NAME, REDIS_URL, run_worker

log = structlog.get_logger()


def main() -> None:
    log.info("parser_worker.start", queue=PARSE_QUEUE_NAME, redis_url=REDIS_URL)
    try:
        asyncio.run(run_worker())
    except KeyboardInterrupt:
        log.info("parser_worker.interrupted")


if __name__ == "__main__":
    main()
