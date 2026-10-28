# The workshop MCP server on top of the toolbox (it needs node and the game's dependencies for run_build).
# Build it after factory-toolbox: scripts/images.sh
ARG BASE=factory-toolbox:lesson
FROM ${BASE}
RUN pip3 install --no-cache-dir --break-system-packages "mcp>=1.10,<2"
COPY workspace.py server.py /app/
WORKDIR /app
ENV WORK_DIR=/work/repo EVENTS_FILE=/work/events.jsonl PORT=3000 PYTHONUNBUFFERED=1
EXPOSE 3000
CMD ["python3", "/app/server.py"]
