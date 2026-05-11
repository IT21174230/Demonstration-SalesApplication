import json
from typing import Dict, List
from pathlib import Path

HISTORY_FILE = Path(__file__).resolve().parent.parent.parent / "Data" / "history.txt"


def save_to_history(messege_dict: Dict):
    try:
        with open(HISTORY_FILE, 'a', encoding='utf-8') as f:
            f.write(json.dumps(messege_dict) + '\n')
    except Exception as e:
        print(e)


def load_history(n: int = 5) -> List[Dict]:
    try:
        with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
            lines = f.readlines()

        # Take the last n non-empty lines
        recent = [line.strip() for line in lines if line.strip()][-n:]

        messages = []
        for line in recent:
            try:
                messages.append(json.loads(line))
            except json.JSONDecodeError:
                continue  # skip malformed lines
        return messages
    except FileNotFoundError:
        return []
    except Exception as e:
        print(e)
        return []
