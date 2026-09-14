"""Two-layer cache for LLM results: in-process LRU, then Firestore.

The same lesson gets opened repeatedly by a whole class, and simplification of an
identical (text, profile) pair is deterministic enough to reuse. Without this,
one lesson read by 30 students is 30 Gemini calls for one answer.
"""

import hashlib
from collections import OrderedDict
from typing import Any, Callable, Optional

from firebase_config import db

_MEM_MAX = 128
_mem: "OrderedDict[str, Any]" = OrderedDict()


def make_key(*parts: str) -> str:
    return hashlib.sha256("\x00".join(parts).encode("utf-8")).hexdigest()[:32]


def _mem_get(key: str) -> Optional[Any]:
    if key in _mem:
        _mem.move_to_end(key)
        return _mem[key]
    return None


def _mem_put(key: str, value: Any) -> None:
    _mem[key] = value
    _mem.move_to_end(key)
    if len(_mem) > _MEM_MAX:
        _mem.popitem(last=False)


def get_or_compute(collection: str, key: str, compute: Callable[[], Any]) -> Any:
    """Return a cached value or compute and store it.

    A cache failure must never fail the request — if Firestore is down we just
    recompute, which is slower but correct.
    """
    hit = _mem_get(key)
    if hit is not None:
        return hit

    if db is not None:
        try:
            doc = db.collection(collection).document(key).get()
            if doc.exists:
                value = doc.to_dict().get("value")
                if value is not None:
                    _mem_put(key, value)
                    return value
        except Exception as exc:  # noqa: BLE001
            print(f"[cache] read failed for {collection}/{key}: {exc}")

    value = compute()
    _mem_put(key, value)

    if db is not None:
        try:
            db.collection(collection).document(key).set({"value": value})
        except Exception as exc:  # noqa: BLE001
            print(f"[cache] write failed for {collection}/{key}: {exc}")

    return value


def clear_memory() -> None:
    """Test hook."""
    _mem.clear()
