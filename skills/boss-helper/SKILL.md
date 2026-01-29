---
name: boss-helper
displayName: Boss Helper Tools
description: Simplified commands for boss to manage employees and assign tasks
---

# Boss Helper Tools

Provides three simplified commands for task management. All commands automatically use GOODABLE_API_BASE environment variable.

## 1. assign_task

Assign a task to an employee by name (supports fuzzy matching).

**Usage:**
```bash
python scripts/boss_cli.py assign_task "<employee_name>" "<task_description>"
```

**Examples:**
```bash
# Assign to frontend engineer
python scripts/boss_cli.py assign_task "前端工程师" "优化首页加载速度，减少白屏时间"

# Fuzzy match works
python scripts/boss_cli.py assign_task "前端" "修复移动端布局问题"

# Assign to Python developer
python scripts/boss_cli.py assign_task "Python" "编写数据处理脚本"
```

**Returns:**
- Success: Task ID and confirmation message
- Error: Employee not found or creation failed

---

## 2. get_employee_status

Get detailed status of a specific employee.

**Usage:**
```bash
python scripts/boss_cli.py get_employee_status "<employee_name>"
```

**Examples:**
```bash
# Check frontend engineer status
python scripts/boss_cli.py get_employee_status "前端工程师"

# Fuzzy match works
python scripts/boss_cli.py get_employee_status "前端"
```

**Returns:**
- Employee name and description
- Running tasks list (if any)
- Total task count

---

## 3. get_all_status

Get summary status of all employees.

**Usage:**
```bash
python scripts/boss_cli.py get_all_status
```

**Returns:**
- List of all employees with their status
- Working employees with current tasks
- Idle employees

---

## Implementation Notes

- All commands use `GOODABLE_API_BASE` environment variable (auto-injected by platform)
- Employee name matching is fuzzy (partial match works)
- Task assignment automatically starts execution in background
- Project IDs are auto-generated with format `boss-{8_chars}`
