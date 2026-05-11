# Municipal Bills Prototype — Project Context

## What this project is

A working prototype of a system that automates the processing of municipal property bills for a property management company. The client currently receives thousands of municipal PDF bills each month, prints them, and manually captures each line item. There is no current system for flagging unexpected usage spikes, missing bills, or extraction errors.

## What we are building

An end-to-end functional prototype that:
- Ingests municipal PDF bills
- Extracts line items automatically
- Flags anomalies (unexpected usage spikes, missing bills, extraction errors)
- Presents results for human review before any values are approved

The prototype will be tested with real PDF bills and demonstrated to the client.

## Critical system rules

This is a high-stakes financial system. Bills are used to make payments. Any incorrect extracted value has direct financial consequence.

**The system must be conservative:**
- Flag uncertainty for human review rather than silently approve questionable data
- Never assume an extracted value is correct if there is any doubt
- Err on the side of caution at every decision point

## How to work with me (the developer)

- I am a beginner. Explain things in plain, simple language.
- Walk me through steps one at a time and wait for confirmation before continuing.
- Follow coding best practices in all code, setup, workflows, and infrastructure.
- **Never change or create files without telling me first and getting my approval.**
- If something could go wrong, warn me before we proceed.
- If there are multiple ways to do something, explain the options simply before recommending one.
