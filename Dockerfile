FROM node:20

WORKDIR /app

RUN apt-get update && apt-get install -y nano less pip

RUN pip install 'pre-commit==3.*'

RUN npm install -g yo generator-code @vscode/vsce

COPY package-lock.json package.json ./
RUN npm install

COPY . .

RUN pre-commit install-hooks
