#!/bin/bash
# Fallback script to build pdffigures2 from source if JAR download fails

set -e

echo "Building pdffigures2 from source..."

# Install sbt and git
apt-get update && apt-get install -y git gnupg2

# Add sbt repo
echo "deb https://repo.scala-sbt.org/scalasbt/debian all main" | tee /etc/apt/sources.list.d/sbt.list
curl -sL "https://keyserver.ubuntu.com/pks/lookup?op=get&search=0x2EE0EA64E40A89B84B2DF73499E82A75642AC823" | apt-key add
apt-get update && apt-get install -y sbt

# Clone and build
cd /tmp
git clone https://github.com/allenai/pdffigures2.git
cd pdffigures2

# Build fat jar using sbt-assembly plugin
# Need to add assembly plugin first
mkdir -p project
echo 'addSbtPlugin("com.eed3si9n" % "sbt-assembly" % "2.1.5")' >> project/plugins.sbt

# Build the assembly jar
sbt assembly

# Find and copy the built jar (it might have different names)
echo "Looking for assembly jar..."
find target -name "*.jar" -type f
JAR_FILE=$(find target -name "*assembly*.jar" -type f | head -1)
if [ -z "$JAR_FILE" ]; then
  # Try to find any jar in target
  JAR_FILE=$(find target/scala-2.12 -name "*.jar" -type f | grep -v "sources\|javadoc" | head -1)
fi

if [ -n "$JAR_FILE" ]; then
  echo "Found jar: $JAR_FILE"
  cp "$JAR_FILE" /app/pdffigures2.jar
else
  echo "ERROR: No jar file found!"
  exit 1
fi

# Cleanup
cd /
rm -rf /tmp/pdffigures2
apt-get remove -y git sbt
apt-get autoremove -y

echo "pdffigures2 build complete!"
