# Coding Standard/Guide

 - Coding within the guidelines given inside the architecture files (and any other files provided). If any anything extra needed to be added, or you have any suggestions, discuss it first.
 - Comments should be good enough that even someone with near zero coding knowledge can understand it by reading once
 - Use the best practices, unless prompted otherwise. No shortcuts to be taken
 - Every file should have exactly one primary responsibility.
 - before coding, write the detailed steps first, give out implementation order for the steps
 - Once the feature is completed, make a testing layer with proper test cases to test out if the features are working correctly. 
 - Never make assumptions on your own. If any question is there, any architectural change that you need to suggest, ask me first before implementing. 
 - Error handling needs to be done gracefully. No db, compilation, backend issue should be visible on the frontend. On top of that, the errors should be displayed on the frontend in a very user friendly way, assuming that the person using them have no idea of programming at all. So that they can easily understand what went wrong.
 - Always write the test cases first before implementing the task. The task, once implemented, should be passing the test case. This will be equivalent to defining the goal first, then implemention. This will also make sure that black box testing is followed.
  - Before implementing, inspect the relevant existing code, architecture, patterns, dependencies, and tests. Reuse existing implementations where appropriate instead of creating new ones unnecessarily.
 - Keep changes strictly within the scope of the requested feature. Do not perform unrelated refactoring, cleanup, or architectural changes unless they are required or approved.
 - Every requirement should be traceable to an implementation and a corresponding test. Before declaring the feature complete, verify that no requirement has been missed.
 - Tests should focus on meaningful observable behavior and risk, not maximum test count. Prefer representative cases over exhaustive combinations and avoid redundant tests.
 - During implementation, run targeted tests for the affected code. After the feature is complete, run the relevant feature tests and then the full test suite once for regression testing. Do not repeatedly run the entire suite after every small change unless necessary.
 - Never weaken production code, validation, constraints, security, or test assertions simply to make the implementation or tests pass. Fix the underlying problem instead.
 - Never claim that a feature, test, build, migration, API, or other behavior works unless it has actually been verified. Clearly report anything that could not be verified.