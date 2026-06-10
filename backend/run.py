import sys
import asyncio

# Patch asyncio.set_event_loop_policy on Windows before importing Uvicorn
# to prevent Uvicorn from forcing the SelectorEventLoop.
# Playwright requires the ProactorEventLoop to run subprocesses on Windows.
if sys.platform == 'win32':
    _original_set_policy = asyncio.set_event_loop_policy
    
    def _patched_set_policy(policy):
        if isinstance(policy, asyncio.WindowsSelectorEventLoopPolicy):
            # Ignore Uvicorn forcing Selector
            return
        _original_set_policy(policy)
        
    asyncio.set_event_loop_policy = _patched_set_policy
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

import uvicorn

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
