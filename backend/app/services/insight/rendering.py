def render_structured_content_as_text(content: dict) -> str:
    """Flattens a structured insight dict ({headline, sections, watch_items}) into
    the same plain-text paragraph digest used for the legacy `body` column - shared
    by generation-time digest creation (generator.py) and PDF export, so a human
    edit's flattened text stays in sync with however the AI-generated version is
    rendered. Takes a plain dict (not a specific Pydantic type) since callers pass
    both a freshly-generated GeneratedInsight.model_dump() and a stored JSONB blob
    (structured_content or edited_content) interchangeably - both have this shape."""
    lines = [content["headline"], ""]
    for section in content.get("sections", []):
        stats = "; ".join(
            f"{stat['label']} {stat['value']}" + (f" ({stat['note']})" if stat.get("note") else "")
            for stat in section.get("key_stats", [])
        )
        lines.append(f"{section['label']}: {section['summary']} {stats}. {section['detail']}".strip())
    watch_items = content.get("watch_items") or []
    if watch_items:
        lines.append("")
        lines.append("Watch: " + " | ".join(watch_items))
    return "\n".join(lines)
