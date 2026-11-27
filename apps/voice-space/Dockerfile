# Small voice server: ONNX Runtime only, no PyTorch. Runs on Render free (512 MB) or a Hugging Face Docker Space.
FROM python:3.11-slim

RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user PATH=/home/user/.local/bin:$PATH
WORKDIR /home/user/app

COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# The voices come from the release made by .github/workflows/voices.yml, checked against its SHA256SUMS.
ARG VOICES_URL=https://github.com/ephrathasamuel/digital-bridge/releases/download/voices-v1
ARG VOICE_LANGS="om am ti so en"
RUN mkdir voices && cd voices \
 && python -c "import sys, urllib.request as u; [u.urlretrieve(sys.argv[1] + '/' + f, f) for f in sys.argv[2:]]" \
      "$VOICES_URL" SHA256SUMS $(for l in $VOICE_LANGS; do echo mms-$l.onnx mms-$l.json; done) \
 && grep -E "mms-($(echo $VOICE_LANGS | tr ' ' '|'))\." SHA256SUMS | sha256sum -c -

COPY --chown=user mms_text.py numbers_words.py app.py ./

# Render sets PORT; a Hugging Face Space uses 7860.
EXPOSE 7860
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-7860}"]
