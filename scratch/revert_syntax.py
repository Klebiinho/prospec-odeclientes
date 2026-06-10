def fix_types(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Revert the bad replaces
    content = content.replace("LeadResponse(  # type: ignore", "LeadResponse(")
    content = content.replace("SearchResponse(  # type: ignore", "SearchResponse(")

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print("Reverted bad syntax")

if __name__ == "__main__":
    fix_types("backend/main.py")
