// Counted nouns for interface copy: plural(1, 'skill') -> "1 skill", plural(3, 'person', 'people') -> "3 people".
export const plural = (count, singular, pluralWord = `${singular}s`) => `${count} ${count === 1 ? singular : pluralWord}`;
