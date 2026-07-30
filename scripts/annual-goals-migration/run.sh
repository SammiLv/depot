#!/usr/bin/env bash
# 年度指标模型重构 · 一次性迁移入口（转发到 prod/cutover.sh）
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/prod/cutover.sh" "$@"
