# parser-worker

Python PDF parser worker for the digital document distribution.

## Setup

```bash
uv sync --dev
uv run pytest -q
uv run ruff check .
```

Low parser confidence yields `needs_review` rather than false automation (Anhang E.2).
