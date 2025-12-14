"""
pdffigures2 HTTP API Server

Wraps pdffigures2 CLI as a simple HTTP API for figure detection.
"""

import json
import os
import subprocess
import tempfile
import uuid
from flask import Flask, request, jsonify

app = Flask(__name__)

# Path to pdffigures2 JAR and dependencies
PDFFIGURES2_JAR = os.environ.get('PDFFIGURES2_JAR', '/app/pdffigures2.jar')
LIB_DIR = os.environ.get('LIB_DIR', '/app/lib')

def get_classpath():
    """Build classpath from main jar and all dependency jars"""
    jars = [PDFFIGURES2_JAR]

    # Add all jars from lib directory recursively
    if os.path.exists(LIB_DIR):
        for root, dirs, files in os.walk(LIB_DIR):
            for f in files:
                if f.endswith('.jar'):
                    jars.append(os.path.join(root, f))

    return ':'.join(jars)

# Data directory for temporary files
DATA_DIR = os.environ.get('DATA_DIR', '/data')


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    jar_exists = os.path.exists(PDFFIGURES2_JAR)
    return jsonify({
        'status': 'healthy' if jar_exists else 'degraded',
        'jar_exists': jar_exists,
        'jar_path': PDFFIGURES2_JAR
    })


@app.route('/extract', methods=['POST'])
def extract_figures():
    """
    Extract figures from a PDF file.

    Accepts PDF as multipart/form-data with key 'pdf'
    Returns JSON array of detected figures with bounding boxes.
    """
    if 'pdf' not in request.files:
        return jsonify({'error': 'No PDF file provided'}), 400

    pdf_file = request.files['pdf']
    if pdf_file.filename == '':
        return jsonify({'error': 'Empty filename'}), 400

    # Generate unique ID for this request
    request_id = str(uuid.uuid4())

    # Create temp directory for this request
    work_dir = os.path.join(DATA_DIR, request_id)
    os.makedirs(work_dir, exist_ok=True)

    try:
        # Save uploaded PDF
        pdf_path = os.path.join(work_dir, 'input.pdf')
        pdf_file.save(pdf_path)

        # Output path for JSON
        output_path = os.path.join(work_dir, 'output.json')

        # Run pdffigures2
        # Command: java -cp <classpath> org.allenai.pdffigures2.FigureExtractorBatchCli <pdf_path> -d <output_prefix>
        # -d: output figure data as JSON (figure-data-prefix)
        classpath = get_classpath()
        cmd = [
            'java', '-cp', classpath,
            'org.allenai.pdffigures2.FigureExtractorBatchCli',
            pdf_path,
            '-d', os.path.join(work_dir, ''),  # JSON output prefix (will append filename)
        ]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60  # 60 second timeout
        )

        if result.returncode != 0:
            app.logger.error(f"pdffigures2 failed: {result.stderr}")
            return jsonify({
                'error': 'pdffigures2 extraction failed',
                'stderr': result.stderr[:1000]  # Limit error message size
            }), 500

        # Read the output JSON
        # pdffigures2 creates <prefix><filename>.json, so for input.pdf it creates <prefix>input.json
        figures_json_path = os.path.join(work_dir, 'input.json')

        if not os.path.exists(figures_json_path):
            # No figures found, return empty array
            return jsonify({'figures': []})

        with open(figures_json_path, 'r') as f:
            raw_figures = json.load(f)

        # Transform pdffigures2 output to our format
        figures = transform_figures(raw_figures)

        return jsonify({'figures': figures})

    except subprocess.TimeoutExpired:
        return jsonify({'error': 'Processing timeout'}), 504
    except Exception as e:
        app.logger.exception(f"Error processing PDF: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        # Cleanup temp files
        import shutil
        try:
            shutil.rmtree(work_dir)
        except Exception:
            pass


def transform_figures(raw_figures):
    """
    Transform pdffigures2 output to our standardized format.

    pdffigures2 output format:
    {
        "name": "Figure 1",
        "figType": "Figure",
        "page": 2,
        "caption": "...",
        "regionBoundary": {"x1": 100, "y1": 200, "x2": 500, "y2": 600}
    }

    Our output format:
    {
        "name": "Figure 1",
        "page": 2,
        "caption": "...",
        "regionBoundary": {"x1": 100, "y1": 200, "x2": 500, "y2": 600},
        "figType": "Figure"
    }
    """
    figures = []

    for fig in raw_figures:
        # pdffigures2 outputs figures and tables
        fig_type = fig.get('figType', 'Figure')

        # Get the region boundary
        region = fig.get('regionBoundary', {})

        figures.append({
            'name': fig.get('name', ''),
            'figType': fig_type,
            'page': fig.get('page', 0),
            'caption': fig.get('caption', ''),
            'regionBoundary': {
                'x1': region.get('x1', 0),
                'y1': region.get('y1', 0),
                'x2': region.get('x2', 0),
                'y2': region.get('y2', 0)
            },
            # Include image boundary if available (figure content only, without caption)
            'imageBoundary': fig.get('imageBoundary', None)
        })

    return figures


@app.route('/extract-from-path', methods=['POST'])
def extract_figures_from_path():
    """
    Extract figures from a PDF file path (for mounted volumes).

    Expects JSON body: {"pdf_path": "/data/paper.pdf"}
    Returns JSON array of detected figures.
    """
    data = request.get_json()
    if not data or 'pdf_path' not in data:
        return jsonify({'error': 'No pdf_path provided'}), 400

    pdf_path = data['pdf_path']

    if not os.path.exists(pdf_path):
        return jsonify({'error': f'PDF not found: {pdf_path}'}), 404

    # Generate unique ID for output
    request_id = str(uuid.uuid4())
    work_dir = os.path.join(DATA_DIR, request_id)
    os.makedirs(work_dir, exist_ok=True)

    try:
        # Run pdffigures2
        classpath = get_classpath()
        pdf_basename = os.path.splitext(os.path.basename(pdf_path))[0]
        cmd = [
            'java', '-cp', classpath,
            'org.allenai.pdffigures2.FigureExtractorBatchCli',
            pdf_path,
            '-d', os.path.join(work_dir, ''),
        ]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60
        )

        if result.returncode != 0:
            app.logger.error(f"pdffigures2 failed: {result.stderr}")
            return jsonify({
                'error': 'pdffigures2 extraction failed',
                'stderr': result.stderr[:1000]
            }), 500

        # Read output
        figures_json_path = os.path.join(work_dir, f'{pdf_basename}.json')

        if not os.path.exists(figures_json_path):
            return jsonify({'figures': []})

        with open(figures_json_path, 'r') as f:
            raw_figures = json.load(f)

        figures = transform_figures(raw_figures)
        return jsonify({'figures': figures})

    except subprocess.TimeoutExpired:
        return jsonify({'error': 'Processing timeout'}), 504
    except Exception as e:
        app.logger.exception(f"Error processing PDF: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        import shutil
        try:
            shutil.rmtree(work_dir)
        except Exception:
            pass


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080, debug=True)
