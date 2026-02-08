FROM denoland/deno:2.1.4

WORKDIR /app
COPY . .

RUN deno cache src/main.ts

EXPOSE 8000

CMD ["deno", "run", "--allow-net", "--allow-env", "--allow-read", "src/main.ts"]
