"""Python PDF parser worker (modular monolith side-worker, §12.1)."""

from parser_worker.models import ParseJobResult, ParseStatus

__version__ = "0.1.0"
# Identifies which parser produced a result; bump on extraction/mapping changes
# so golden-master regressions are attributable (§16.3 release / Parser-Templates).
PARSER_VERSION = f"parser-worker-{__version__}"

__all__ = ["ParseJobResult", "ParseStatus", "PARSER_VERSION", "__version__"]
