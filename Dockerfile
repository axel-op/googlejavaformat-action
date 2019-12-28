FROM openjdk:14-jdk-alpine

ENV EXECUTABLE /google-java-format.jar

RUN apk add --no-cache bash curl git jq

RUN curl -Lv $(curl -s "https://api.github.com/repos/google/google-java-format/releases/latest" | jq ".assets" | jq -r '.[] | select(.name|test(".all-deps.jar")) | .browser_download_url') -o $EXECUTABLE

COPY entrypoint.sh /entrypoint.sh

ENTRYPOINT ["bash", "/entrypoint.sh"]
