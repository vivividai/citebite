# pdffigures2 Docker Container
# Multi-stage build for figure detection via HTTP API

# Stage 1: Build pdffigures2 JAR
FROM eclipse-temurin:8-jdk AS builder

# Install build dependencies
RUN apt-get update && apt-get install -y \
    git \
    gnupg2 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install sbt
RUN echo "deb https://repo.scala-sbt.org/scalasbt/debian all main" | tee /etc/apt/sources.list.d/sbt.list && \
    curl -sL "https://keyserver.ubuntu.com/pks/lookup?op=get&search=0x2EE0EA64E40A89B84B2DF73499E82A75642AC823" | apt-key add && \
    apt-get update && apt-get install -y sbt

# Clone pdffigures2
WORKDIR /build
RUN git clone https://github.com/allenai/pdffigures2.git
WORKDIR /build/pdffigures2

# Build the project
RUN sbt compile && sbt "runMain org.allenai.pdffigures2.FigureExtractorBatchCli --help" || true

# Create a runnable jar using sbt-pack or assembly
# pdffigures2 already has assembly plugin configured
RUN sbt assembly || (sbt pack && tar -czf pdffigures2-pack.tar.gz target/pack)

# Find the built jar
RUN find target -name "*.jar" -type f | head -20

# Stage 2: Runtime image
FROM eclipse-temurin:8-jre

# Install Python for HTTP server
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    curl \
    && pip3 install --break-system-packages flask gunicorn \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built JAR from builder (fat JAR includes all dependencies)
# pdffigures2's build.sbt sets: assemblyOutputPath := file("pdffigures2.jar")
# So the fat JAR is in the project root, not target/scala-2.12/
COPY --from=builder /build/pdffigures2/pdffigures2.jar /app/pdffigures2.jar

# Copy HTTP server
COPY server.py /app/

# Create data directory
RUN mkdir -p /data

# Expose HTTP port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Run the HTTP server
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--timeout", "120", "--workers", "2", "server:app"]
