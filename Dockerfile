FROM node:20-slim
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
COPY . .
RUN npm install && npm run generate -w @tidepool/db
ARG APP
ENV APP=$APP
CMD ["sh", "-c", "npx tsx apps/$APP/src/index.ts"]
