export function challengeDetected(text) {
  return /performing security verification|verify you are (?:a )?human|captcha|access denied|unusual traffic|checking your browser/i.test(String(text));
}
