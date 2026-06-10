import re

def fix_types(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Add type imports if not present
    if "from typing import Any, cast" not in content:
        content = content.replace("from typing import Optional", "from typing import Optional, Any, cast")

    # Fix: select("id", count="exact")
    # postgrest-py defines CountMethod = Literal["exact", "planned", "estimated"]
    # We can just append a type ignore for now, or use cast
    content = re.sub(
        r'select\("id", count="exact"\)',
        r'select("id", count="exact")  # type: ignore',
        content
    )

    # Fix variables that come from JSON which Pyright thinks might be int/float/etc.
    # name = lead.get("name", "amigo")
    content = re.sub(
        r'name = lead\.get\("name", "amigo"\)',
        r'name = str(lead.get("name", "amigo"))',
        content
    )
    
    # address = lead.get("address", "")
    content = re.sub(
        r'address = lead\.get\("address", ""\)',
        r'address = str(lead.get("address", ""))',
        content
    )

    # phone = format_whatsapp_number(lead.get("phone", ""))
    content = re.sub(
        r'phone = format_whatsapp_number\(lead\.get\("phone", ""\)\)',
        r'phone = format_whatsapp_number(str(lead.get("phone", "")))',
        content
    )

    # first_name = name.split()[0] if name else "amigo"
    # Pyright complains because it doesn't know name is str. But we fixed `name = str(...)` above.

    # text = template_content.replace("{{nome}}", name)
    # Pyright thinks template_content could be int/float
    content = re.sub(
        r'text = template_content\.replace',
        r'text = str(template_content).replace',
        content
    )

    # query_name = search_result.data[0]["query"].replace(" ", "_")[:30]
    content = re.sub(
        r'query_name = search_result\.data\[0\]\["query"\]\.replace',
        r'query_name = str(search_result.data[0]["query"]).replace',
        content
    )

    # res.data might be None, so we should be careful with casting, but we already have if not res.data...
    
    # For all the "error: Object of type 'None' is not subscriptable"
    # "updated.data[0]" or "inserted.data[0]"
    # Let's add # type: ignore where needed for data[0] if pyright still complains
    content = re.sub(
        r'(return res\.data\[0\])',
        r'\1  # type: ignore',
        content
    )
    content = re.sub(
        r'(return updated\.data\[0\])',
        r'\1  # type: ignore',
        content
    )
    content = re.sub(
        r'(return inserted\.data\[0\])',
        r'\1  # type: ignore',
        content
    )

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print("Fixed types in main.py")

if __name__ == "__main__":
    fix_types("backend/main.py")
