// Public-domain Shakespeare, ~60–75 words each (about 1.5 minutes at a
// normal typing pace once you account for the old spellings). Plain ASCII
// on purpose: straight apostrophes, "-" for dashes, so nobody has to hunt
// for an em dash key.
export const PASSAGES: { source: string; text: string }[] = [
  {
    source: "Hamlet, Act 3 Scene 1",
    text:
      "To be, or not to be, that is the question: Whether 'tis nobler in the mind to suffer " +
      "The slings and arrows of outrageous fortune, Or to take arms against a sea of troubles " +
      "And by opposing end them. To die - to sleep, No more; and by a sleep to say we end " +
      "The heart-ache and the thousand natural shocks That flesh is heir to: 'tis a consummation " +
      "Devoutly to be wish'd.",
  },
  {
    source: "Macbeth, Act 5 Scene 5",
    text:
      "Tomorrow, and tomorrow, and tomorrow, Creeps in this petty pace from day to day, " +
      "To the last syllable of recorded time; And all our yesterdays have lighted fools " +
      "The way to dusty death. Out, out, brief candle! Life's but a walking shadow, a poor player, " +
      "That struts and frets his hour upon the stage, And then is heard no more. It is a tale " +
      "Told by an idiot, full of sound and fury, Signifying nothing.",
  },
  {
    source: "Sonnet 18",
    text:
      "Shall I compare thee to a summer's day? Thou art more lovely and more temperate: " +
      "Rough winds do shake the darling buds of May, And summer's lease hath all too short a date; " +
      "Sometime too hot the eye of heaven shines, And often is his gold complexion dimm'd; " +
      "And every fair from fair sometime declines, By chance or nature's changing course untrimm'd; " +
      "But thy eternal summer shall not fade, Nor lose possession of that fair thou ow'st.",
  },
  {
    source: "The Merchant of Venice, Act 4 Scene 1",
    text:
      "The quality of mercy is not strain'd; It droppeth as the gentle rain from heaven " +
      "Upon the place beneath: it is twice blest; It blesseth him that gives and him that takes: " +
      "'Tis mightiest in the mightiest: it becomes The throned monarch better than his crown; " +
      "His sceptre shows the force of temporal power, The attribute to awe and majesty, " +
      "Wherein doth sit the dread and fear of kings.",
  },
  {
    source: "As You Like It, Act 2 Scene 7",
    text:
      "All the world's a stage, And all the men and women merely players; They have their exits " +
      "and their entrances, And one man in his time plays many parts, His acts being seven ages. " +
      "At first, the infant, Mewling and puking in the nurse's arms. Then the whining school-boy, " +
      "with his satchel And shining morning face, creeping like snail Unwillingly to school.",
  },
  {
    source: "Julius Caesar, Act 3 Scene 2",
    text:
      "Friends, Romans, countrymen, lend me your ears; I come to bury Caesar, not to praise him. " +
      "The evil that men do lives after them; The good is oft interred with their bones; " +
      "So let it be with Caesar. The noble Brutus Hath told you Caesar was ambitious: " +
      "If it were so, it was a grievous fault, And grievously hath Caesar answer'd it.",
  },
];

/** Lenient on whitespace and smart punctuation, strict on everything else. */
export function normalizeTyping(s: string): string {
  return s
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** Minimum time an abort must take, so the gate can't be skipped instantly. */
export const MIN_ABORT_MS = 30_000;
