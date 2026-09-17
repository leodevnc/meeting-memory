import test from 'node:test';
import assert from 'node:assert/strict';
import { assertTransition, canTransition } from '../src/core/state.js';

test('allows retry-safe same-state and valid forward transitions',()=>{assert.equal(canTransition('TRANSCRIBING','TRANSCRIBING'),true);assert.equal(canTransition('TRANSCRIBING','ANALYZING'),true)});
test('blocks a ready meeting from being reprocessed',()=>assert.throws(()=>assertTransition('READY','ANALYZING')));
