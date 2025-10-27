# syntax=docker/dockerfile:1.6

FROM rust:1.83-bullseye AS builder
WORKDIR /build

# Copy the Rust workspace that contains the attn_api crate.
COPY protocol ./protocol

# Build the release binary for attn_api.
RUN cargo build --manifest-path protocol/Cargo.toml -p attn_api --release --locked

FROM gcr.io/distroless/cc-debian12 AS runtime
WORKDIR /app

# Copy the compiled binary into the runtime image.
COPY --from=builder /usr/lib/x86_64-linux-gnu/libssl.so.1.1 /usr/lib/x86_64-linux-gnu/
COPY --from=builder /usr/lib/x86_64-linux-gnu/libcrypto.so.1.1 /usr/lib/x86_64-linux-gnu/
COPY --from=builder /usr/lib/x86_64-linux-gnu/libssl.so /usr/lib/x86_64-linux-gnu/
COPY --from=builder /usr/lib/x86_64-linux-gnu/libcrypto.so /usr/lib/x86_64-linux-gnu/
COPY --from=builder /build/protocol/target/release/attn_api /app/attn_api

ENV RUST_LOG=info
EXPOSE 8080

USER 65532:65532
ENTRYPOINT ["/app/attn_api"]
