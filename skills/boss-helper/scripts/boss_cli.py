#!/usr/bin/env python3
"""
Boss Helper CLI - Simplified commands for task management
"""

import os
import sys
import json
import random
import string

try:
    import requests
except ImportError:
    print("Error: requests library not found. Installing...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "requests"])
    import requests


API_BASE = os.environ.get('GOODABLE_API_BASE', 'http://localhost:3033')


def generate_project_id():
    """Generate random project ID: boss-{8 chars}"""
    chars = string.ascii_lowercase + string.digits
    random_str = ''.join(random.choices(chars, k=8))
    return f"boss-{random_str}"


def fetch_employees():
    """Fetch all employees from API"""
    try:
        response = requests.get(f'{API_BASE}/api/employees', timeout=10)
        response.raise_for_status()
        data = response.json()
        return data.get('data', [])
    except Exception as e:
        print(f"Error fetching employees: {e}")
        sys.exit(1)


def find_employee(employees, name_query):
    """Find employee by fuzzy name matching"""
    # Exact match first
    for emp in employees:
        if emp['name'] == name_query:
            return emp

    # Fuzzy match (contains)
    matches = [emp for emp in employees if name_query in emp['name']]

    if len(matches) == 0:
        return None
    elif len(matches) == 1:
        return matches[0]
    else:
        # Multiple matches, return first
        print(f"Warning: Multiple employees match '{name_query}', using first: {matches[0]['name']}")
        return matches[0]


def assign_task(employee_name, task_description):
    """Assign task to employee"""
    # 1. Fetch employees
    employees = fetch_employees()

    # 2. Find matching employee
    employee = find_employee(employees, employee_name)

    if not employee:
        print(f"[ERROR] Employee not found: {employee_name}")
        print(f"\nAvailable employees:")
        for emp in employees:
            print(f"  - {emp['name']} ({emp.get('category', 'N/A')})")
        sys.exit(1)

    # 3. Generate project ID
    project_id = generate_project_id()

    # 4. Create project with autoStart
    payload = {
        "project_id": project_id,
        "name": task_description[:50] if len(task_description) > 50 else task_description,
        "employee_id": employee['id'],
        "mode": employee.get('mode', 'work'),
        "initialPrompt": task_description,
        "autoStart": True
    }

    try:
        response = requests.post(f'{API_BASE}/api/projects', json=payload, timeout=10)
        response.raise_for_status()

        print(f"[OK] Task assigned to {employee['name']}")
        print(f"  Project ID: {project_id}")
        print(f"  Task: {task_description}")
        print(f"  Status: Starting in background...")

    except Exception as e:
        print(f"[ERROR] Failed to create task: {e}")
        sys.exit(1)


def get_employee_status(employee_name):
    """Get status of specific employee"""
    # 1. Fetch all status
    try:
        response = requests.get(f'{API_BASE}/api/boss/employees-status', timeout=10)
        response.raise_for_status()
        data = response.json()
        statuses = data.get('data', [])
    except Exception as e:
        print(f"Error fetching status: {e}")
        sys.exit(1)

    # 2. Find matching employee
    employee = None
    for emp in statuses:
        if employee_name == emp['name'] or employee_name in emp['name']:
            employee = emp
            break

    if not employee:
        print(f"[ERROR] Employee not found: {employee_name}")
        sys.exit(1)

    # 3. Display status
    print(f"\n[STATUS] {employee['name']}")
    print(f"   Category: {employee.get('category', 'N/A')}")
    print(f"   Mode: {employee.get('mode', 'N/A')}")

    running_tasks = employee.get('runningTasks', [])
    total_count = employee.get('totalTaskCount', 0)

    if running_tasks:
        print(f"   Status: Working ({len(running_tasks)} active / {total_count} total)")
        print(f"\n   Current Tasks:")
        for task in running_tasks:
            print(f"     * {task['name']}")
            if task.get('instruction'):
                print(f"       {task['instruction'][:60]}...")
    else:
        print(f"   Status: Idle (0 active / {total_count} total)")


def get_all_status():
    """Get status of all employees"""
    try:
        response = requests.get(f'{API_BASE}/api/boss/employees-status', timeout=10)
        response.raise_for_status()
        data = response.json()
        statuses = data.get('data', [])
    except Exception as e:
        print(f"Error fetching status: {e}")
        sys.exit(1)

    # Separate working and idle employees
    working = [emp for emp in statuses if emp.get('runningTasks')]
    idle = [emp for emp in statuses if not emp.get('runningTasks')]

    print(f"\n[SUMMARY] Employee Status Summary")
    print(f"   Total: {len(statuses)} | Working: {len(working)} | Idle: {len(idle)}")

    if working:
        print(f"\n[WORKING]")
        for emp in working:
            tasks = emp.get('runningTasks', [])
            print(f"   * {emp['name']} - {len(tasks)} active task(s)")
            for task in tasks[:2]:  # Show first 2 tasks
                print(f"     - {task['name']}")

    if idle:
        print(f"\n[IDLE]")
        for emp in idle:
            total = emp.get('totalTaskCount', 0)
            print(f"   * {emp['name']} - {total} total task(s)")


def main():
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python boss_cli.py assign_task <employee_name> <task_description>")
        print("  python boss_cli.py get_employee_status <employee_name>")
        print("  python boss_cli.py get_all_status")
        sys.exit(1)

    command = sys.argv[1]

    if command == "assign_task":
        if len(sys.argv) < 4:
            print("Error: assign_task requires <employee_name> and <task_description>")
            sys.exit(1)
        employee_name = sys.argv[2]
        task_description = sys.argv[3]
        assign_task(employee_name, task_description)

    elif command == "get_employee_status":
        if len(sys.argv) < 3:
            print("Error: get_employee_status requires <employee_name>")
            sys.exit(1)
        employee_name = sys.argv[2]
        get_employee_status(employee_name)

    elif command == "get_all_status":
        get_all_status()

    else:
        print(f"Unknown command: {command}")
        sys.exit(1)


if __name__ == '__main__':
    main()
