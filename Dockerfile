# CutFree — static site, so a tiny nginx image is all we need
FROM nginx:1.27-alpine

LABEL org.opencontainers.image.title="CutFree Studio" \
      org.opencontainers.image.description="Zero-cost video factory in the browser: auto-generated animated videos with WebCodecs, a hand-written WebM muxer, procedural music and a YouTube publish kit" \
      org.opencontainers.image.licenses="MIT"

COPY . /usr/share/nginx/html
RUN rm -f /usr/share/nginx/html/Dockerfile

EXPOSE 80
HEALTHCHECK CMD wget -q -O /dev/null http://localhost/ || exit 1
