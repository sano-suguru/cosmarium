#!/bin/bash
# PostToolUse hook: AI生成コメントパターンを検出し、Claudeにフィードバックする

input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // .tool_input.filePath // empty')

if [ -z "$file_path" ] || [ ! -f "$file_path" ]; then
  exit 0
fi

# バイナリ・非コード・シェーダー・テストファイルはスキップ
case "$file_path" in
  *.png|*.jpg|*.gif|*.svg|*.woff|*.ttf|*.ico|*.lock|*.json|*.md|*.glsl|*.test.ts) exit 0 ;;
esac

# AIコメントパターンを検出
issues=""
while IFS= read -r match; do
  line_num=$(echo "$match" | cut -d: -f1)
  line_content=$(echo "$match" | cut -d: -f2-)
  issues="${issues}  L${line_num}:${line_content}\n"
done < <(grep -nE \
  '//\s*(TODO|FIXME|HACK|XXX)\s*[:.]?\s*(Add|Fix|Implement|Update|Handle|Clean|Refactor)?\s*\w*\s*\.{0,3}\s*$|'\
'//\s*(Initialize|Set up|Create|Define|Declare|Import|Export|Return|Call|Get|Set|Check|Validate|Process|Handle|Update|Remove|Delete|Add|Assign|Convert)\s+(the\s+)?\w+(\s+\w+){0,2}\s*$|'\
'//\s*(Handle|Catch)\s+(the\s+)?(error|exception|failure)s?\s*(here|appropriately|properly|gracefully)?\s*$|'\
'//\s*(Note|Important|NB|Reminder|Warning|Caution)\s*[:.]|'\
'//\s*This (function|method|class|module|component|hook|handler|variable|constant)\s+(does|is|will|should|returns?|creates?|handles?|processes?|validates?|checks?)\s' \
  "$file_path")

if [ -n "$issues" ]; then
  echo "⚠️ AI生成コメントパターンを検出 (${file_path}):" >&2
  echo "" >&2
  echo -e "$issues" >&2
  echo "ルール: 自明なコメントは削除。コメントは「なぜ(WHY)」を説明するものだけ残す。" >&2
  exit 2
fi

exit 0
