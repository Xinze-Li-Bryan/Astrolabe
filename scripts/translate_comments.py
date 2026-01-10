#!/usr/bin/env python3
"""
Scan codebase for Chinese comments and translate them to English.
Outputs a JSON file with all translations for review before applying.
"""

import os
import re
import json
from pathlib import Path

# File extensions to process
EXTENSIONS = {'.ts', '.tsx', '.py', '.rs'}

# Directories to skip
SKIP_DIRS = {'node_modules', '.next', '.git', 'dist', 'build', '__pycache__', '.astrolabe'}

# Chinese character range
CHINESE_PATTERN = re.compile(r'[\u4e00-\u9fff]')

def has_chinese(text: str) -> bool:
    """Check if text contains Chinese characters."""
    return bool(CHINESE_PATTERN.search(text))

def extract_comments(content: str, ext: str) -> list[dict]:
    """Extract comments from source code."""
    comments = []
    lines = content.split('\n')

    if ext in {'.ts', '.tsx', '.rs'}:
        # Single-line comments: //
        for i, line in enumerate(lines):
            match = re.search(r'(//.*?)$', line)
            if match and has_chinese(match.group(1)):
                comments.append({
                    'line': i + 1,
                    'type': 'single',
                    'original': match.group(1),
                    'full_line': line
                })

        # Multi-line comments: /* */
        in_block = False
        block_start = 0
        block_content = []
        for i, line in enumerate(lines):
            if '/*' in line and not in_block:
                in_block = True
                block_start = i + 1
                block_content = [line]
            elif in_block:
                block_content.append(line)
                if '*/' in line:
                    in_block = False
                    full_block = '\n'.join(block_content)
                    if has_chinese(full_block):
                        comments.append({
                            'line': block_start,
                            'type': 'block',
                            'original': full_block,
                            'full_line': full_block
                        })
                    block_content = []

    elif ext == '.py':
        # Single-line comments: #
        for i, line in enumerate(lines):
            match = re.search(r'(#.*?)$', line)
            if match and has_chinese(match.group(1)):
                comments.append({
                    'line': i + 1,
                    'type': 'single',
                    'original': match.group(1),
                    'full_line': line
                })

        # Docstrings: """ or '''
        in_docstring = False
        docstring_char = None
        docstring_start = 0
        docstring_content = []

        for i, line in enumerate(lines):
            if not in_docstring:
                for char in ['"""', "'''"]:
                    if char in line:
                        count = line.count(char)
                        if count == 2:  # Single-line docstring
                            if has_chinese(line):
                                comments.append({
                                    'line': i + 1,
                                    'type': 'docstring',
                                    'original': line.strip(),
                                    'full_line': line
                                })
                        elif count == 1:  # Start of multi-line
                            in_docstring = True
                            docstring_char = char
                            docstring_start = i + 1
                            docstring_content = [line]
                        break
            else:
                docstring_content.append(line)
                if docstring_char in line:
                    in_docstring = False
                    full_docstring = '\n'.join(docstring_content)
                    if has_chinese(full_docstring):
                        comments.append({
                            'line': docstring_start,
                            'type': 'docstring',
                            'original': full_docstring,
                            'full_line': full_docstring
                        })
                    docstring_content = []

    return comments

def scan_codebase(root: Path) -> dict:
    """Scan entire codebase for Chinese comments."""
    results = {}

    for path in root.rglob('*'):
        # Skip directories
        if any(skip in path.parts for skip in SKIP_DIRS):
            continue

        if path.is_file() and path.suffix in EXTENSIONS:
            try:
                content = path.read_text(encoding='utf-8')
                comments = extract_comments(content, path.suffix)
                if comments:
                    rel_path = str(path.relative_to(root))
                    results[rel_path] = comments
            except Exception as e:
                print(f"Error reading {path}: {e}")

    return results

def main():
    root = Path(__file__).parent.parent
    print(f"Scanning {root}...")

    results = scan_codebase(root)

    # Count stats
    total_files = len(results)
    total_comments = sum(len(comments) for comments in results.values())

    print(f"\nFound {total_comments} Chinese comments in {total_files} files")

    # Save to JSON for review
    output_path = root / 'scripts' / 'chinese_comments.json'
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print(f"Saved to {output_path}")

    # Print summary
    print("\n=== Files with Chinese comments ===")
    for file_path, comments in sorted(results.items(), key=lambda x: -len(x[1])):
        print(f"  {file_path}: {len(comments)} comments")

if __name__ == '__main__':
    main()
