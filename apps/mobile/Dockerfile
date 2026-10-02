# Website (QR booking page, client space, back office): Expo web export served by nginx.
# Build from the repository root (npm workspaces): docker build -f apps/mobile/Dockerfile .
# The exported website is plain files: build them on the build machine's own platform, even for Arm servers.
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
COPY apps/mobile/package.json apps/mobile/
RUN npm ci --workspace apps/mobile --include-workspace-root=false --no-audit --no-fund
COPY apps/mobile apps/mobile
# Empty = the website calls the API on its own address (nginx forwards /api and /ws). Set it only to use another API host.
ARG EXPO_PUBLIC_API_URL=""
ARG EXPO_PUBLIC_GEOCODER_URL="https://photon.komoot.io"
ARG EXPO_PUBLIC_MAP_BIAS_LAT="48.8566"
ARG EXPO_PUBLIC_MAP_BIAS_LNG="2.3522"
ENV EXPO_PUBLIC_API_URL=$EXPO_PUBLIC_API_URL \
    EXPO_PUBLIC_GEOCODER_URL=$EXPO_PUBLIC_GEOCODER_URL \
    EXPO_PUBLIC_MAP_BIAS_LAT=$EXPO_PUBLIC_MAP_BIAS_LAT \
    EXPO_PUBLIC_MAP_BIAS_LNG=$EXPO_PUBLIC_MAP_BIAS_LNG
WORKDIR /src/apps/mobile
RUN npx expo export --platform web --output-dir /dist

FROM nginx:1.29-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /dist /usr/share/nginx/html
EXPOSE 80
