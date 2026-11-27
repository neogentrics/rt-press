'use strict';
// The tutorial's practice book: eight short chapters made up for it, long enough to pass KDP's smallest page count, so a person can
// build and save it for real. It is put into a project of its own that is thrown away afterwards, never into the person's own.
const { createBook } = require('../../shared/book-model');

const DETAILS = Object.freeze({ title: 'The Lantern Road', author: 'A. Practice' });
const TITLES = ['The Long Road', 'A Letter Arrives', 'The Harbour', 'Winter Market', 'The Tower', 'Lanterns', 'Orchard Gate', 'Candlelight'];

// Plain sentences about a made-up town, put together in a fixed order, so the practice book is the same every time.
const SENTENCES = [
  'The road came down out of the hills in long, patient turns.', 'By the time the lamps were lit, the square had emptied.',
  'Nobody in the town could say who had built the old tower.', 'The ferry was late again, and the gulls had noticed.',
  'A letter lay on the step, folded once and sealed with green wax.', 'The baker swept her doorway and pretended not to look.',
  'Somewhere beyond the orchard a bell was ringing.', 'The wind came off the water smelling of tar and rain.',
  'He counted the windows twice and got a different number each time.', 'She put the key back where she had found it.',
  'The market stalls went up before dawn, one canvas roof after another.', 'It had snowed in the night, but only on one side of the street.',
  'The harbour master wrote everything down in a small blue book.', 'There were three roads out of town, and only two of them were on the map.',
  'The candle burned lower while they argued about the tide.', 'A dog followed them as far as the bridge and no farther.',
  'The clock in the hall ran slow, and everyone liked it that way.', 'From the top of the stairs you could see the whole bay.',
  'The orchard gate stood open, which it never did.', 'He had meant to leave in the morning, and then in the evening.',
  'The paper was thin, and the ink had run in one corner.', 'Her grandmother had kept bees there, years ago.',
  'The night watch carried a lantern with a cracked pane.', 'Every house on the quay was painted a different colour.',
  'The rain stopped as suddenly as it had begun.', 'They found the map rolled up inside a walking stick.',
  'The old man listened with his eyes closed.', 'A fishing boat came in under half a sail.',
  'The shutters banged all afternoon.', 'No one had climbed that hill since the autumn.',
];
const SPOKEN = [
  'You are early,', 'I did not expect to see you here,', 'Look at the sky before you decide,', 'The bridge will hold,',
  'Someone has been in the tower,', 'Read it again, slowly,', 'We have until the tide turns,', 'Leave the lamp where it is,',
];
const WHO = ['said the ferryman.', 'said the girl from the bakery.', 'said the harbour master.', 'said her uncle.', 'said the old man.'];

function paragraph(seed) {
  const pick = (n) => SENTENCES[(seed * 7 + n * 11) % SENTENCES.length];
  const count = 3 + (seed % 3);
  let text = Array.from({ length: count }, (_, i) => pick(i)).join(' ');
  if (seed % 4 === 2) text = `“${SPOKEN[seed % SPOKEN.length]}” ${WHO[seed % WHO.length]} ${pick(count)}`;
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}

function practiceBook() {
  const sections = TITLES.map((title, c) => {
    const content = Array.from({ length: 16 }, (_, p) => paragraph(c * 16 + p + 1));
    content.splice(8, 0, { type: 'horizontalRule' });
    return { type: 'chapter', id: `practice-${c + 1}`, title, document: { type: 'doc', content } };
  });
  return createBook({ id: 'practice', title: DETAILS.title, sections });
}

module.exports = { DETAILS, practiceBook };
