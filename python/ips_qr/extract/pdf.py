"""Getting text out of a PDF.

Deliberately thin: it shells out to ``pdftotext`` (poppler) when available and
falls back to ``pypdf`` if that is installed. Both are optional — the library
works fine on text you supply yourself, which is what the OCR path does.
"""

from __future__ import annotations

import shutil
import subprocess


class PdfTextError(RuntimeError):
    """No usable PDF text backend, or the backend failed."""


def pdf_to_text(path: str, layout: bool = True) -> str:
    """Extract text from a PDF. Raises PdfTextError when no backend is available.

    ``layout=True`` preserves the visual column structure, which matters: the
    label heuristics read a value as "what sits to the right of the label",
    and reflowed text destroys that relationship.
    """
    binary = shutil.which("pdftotext")
    if binary:
        args = [binary]
        if layout:
            args.append("-layout")
        args += [path, "-"]
        try:
            done = subprocess.run(args, capture_output=True, check=True, timeout=60)
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
            raise PdfTextError(f"pdftotext failed on {path}") from exc
        return done.stdout.decode("utf-8", errors="replace")

    try:
        from pypdf import PdfReader
    except ModuleNotFoundError as exc:
        raise PdfTextError(
            "No PDF text backend. Install poppler (`brew install poppler`) "
            "for pdftotext, or `pip install pypdf`."
        ) from exc

    reader = PdfReader(path)
    return "\n".join(page.extract_text() or "" for page in reader.pages)
