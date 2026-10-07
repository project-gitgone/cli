#!/usr/bin/env node
import { runAssistant } from '@/cli/assistant.js';
import { route } from '@/cli/router.js';
import { tree } from '@/cli/tree.js';

process.exitCode = await route(process.argv.slice(2), tree, { assistant: runAssistant });
