"""Entry point placeholder. EPIC 2 wires this to the Redis/BullMQ parse queue."""

import structlog

log = structlog.get_logger()


def main() -> None:
    log.info("parser_worker.start", message="parser worker baseline – queue wiring in EPIC 2")


if __name__ == "__main__":
    main()
