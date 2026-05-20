FROM rust:1.79-slim AS build
WORKDIR /src
COPY . .
RUN cargo build --release && strip /src/target/release/rainboids-server

FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY --from=build /src/target/release/rainboids-server /usr/local/bin/
EXPOSE 8443 9090
USER 1000:1000
ENTRYPOINT ["/usr/local/bin/rainboids-server"]
