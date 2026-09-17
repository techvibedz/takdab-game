export const number = value => Number(value).toLocaleString('en-US')
export const rankName = rank => rank == null ? '—' : ({ Ace: 'آس', Jack: 'ولد', Queen: 'ملكة', King: 'ملك' }[rank] ?? number(rank))
export const playerName = id => id === 0 ? 'أنت' : `اللاعب ${number(id + 1)}`
export const suitName = suit => ({ '♠': 'بستوني', '♥': 'قلوب', '♦': 'ألماس', '♣': 'سباتي' }[suit])
