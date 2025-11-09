const messages = [
  "Great job!",
  "You're doing awesome!",
  "Keep up the good work!",
  "You're a star!",
  "Fantastic!",
];

export function getEncouragementMessage() {
  return messages[Math.floor(Math.random() * messages.length)];
}