# CutFree — static site, so a tiny nginx image is all we need
FROM nginx:1.27-alpine

LABEL org.opencontainers.image.title="CutFree" \
      org.opencontainers.image.description="Free browser-based video cutter and editor — 100% client-side" \
      org.opencontainers.image.licenses="MIT"

COPY . /usr/share/nginx/html
RUN rm -f /usr/share/nginx/html/Dockerfile

EXPOSE 80
HEALTHCHECK CMD wget -q -O /dev/null http://localhost/ || exit 1
