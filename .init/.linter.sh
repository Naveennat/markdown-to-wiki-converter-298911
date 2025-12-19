#!/bin/bash
cd /home/kavia/workspace/code-generation/markdown-to-wiki-converter-298911/markdown_wiki_frontend
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi

