// Seed data inserted into the SQL database on first start.
exports.faqs = [
  ['How do I book a parking slot?', 'Open the Book a Slot page, pick a date, start time and duration, choose a green (free) slot, enter your name and car number plate, then press Confirm Booking. You will get a booking reference like PK-1234.', 'booking'],
  ['How much does parking cost?', 'Standard slots cost £2.50 per hour, EV charging slots £3.50 per hour and accessible slots £1.50 per hour. The total is shown before you confirm.', 'pricing'],
  ['Can I cancel my booking?', 'Yes. On the Book a Slot page use "Manage booking", enter your booking reference and plate, then press Cancel. Cancellations more than 1 hour before the start time are free.', 'booking'],
  ['What are the opening hours?', 'The car park is open 24 hours a day, 7 days a week. Bookings can be made in 1-hour blocks from 06:00 to 23:00.', 'general'],
  ['Do you have EV charging slots?', 'Yes. Slots E1 to E4 have 7kW chargers. They are marked with a lightning icon on the slot map.', 'facilities'],
  ['Are there accessible / disabled slots?', 'Slots D1 and D2 are wide accessible bays next to the lift. Please display a valid Blue Badge when using them.', 'facilities'],
  ['How far ahead can I book?', 'You can book up to 30 days in advance. Same-day bookings are allowed as long as the slot is free.', 'booking'],
  ['What happens if I overstay?', 'You have a 15-minute grace period. After that an overstay charge of £5 per extra hour applies.', 'pricing'],
  ['Which payment methods are accepted?', 'Payment is taken on arrival at the pay station by card, Apple Pay or Google Pay. Cash is not accepted.', 'pricing'],
  ['Can I change the car on my booking?', 'Yes. Cancel the booking and re-book with the new number plate, or ask the assistant to raise a support ticket and staff will update it.', 'booking'],
  ['Is the car park secure?', 'The site has 24/7 CCTV, number-plate recognition at the barrier and on-site staff from 07:00 to 22:00.', 'general'],
  ['How do I contact a human?', 'Ask the chat assistant anything it cannot answer and it will create a support ticket. Staff reply within one working day.', 'support']
];

exports.errorCodes = [
  ['400', 'Bad Request', 'The request was missing information or had invalid values, e.g. no number plate or an invalid date.', 'Check every field on the form and try again.'],
  ['401', 'Unauthorized', 'You need to identify yourself, e.g. the booking reference and plate did not match.', 'Re-enter the correct booking reference and number plate.'],
  ['403', 'Forbidden', 'You are not allowed to do this, e.g. viewing the admin ticket list without an admin token.', 'Use an account with the right permissions or contact support.'],
  ['404', 'Not Found', 'The page or booking you asked for does not exist.', 'Check the address or booking reference. Use the menu to navigate.'],
  ['429', 'Too Many Requests', 'You sent too many requests in a short time and were rate limited.', 'Wait a minute and try again.'],
  ['500', 'Internal Server Error', 'Something went wrong on our server.', 'Try again shortly. If it continues, ask the assistant to raise a ticket.'],
  ['503', 'Service Unavailable', 'A service (such as the database) is temporarily unavailable or under maintenance.', 'Try again in a few minutes. Check the Health page for status.'],
  ['PK-409', 'Slot Already Booked', 'ParkEasy specific: the slot you chose was booked by someone else for an overlapping time.', 'Refresh the slot map and choose another green slot or a different time.']
];

exports.slots = [
  ...['A1','A2','A3','A4','A5','A6','B1','B2','B3','B4','B5','B6'].map(c => [c, 'standard', 2.5]),
  ...['E1','E2','E3','E4'].map(c => [c, 'ev', 3.5]),
  ...['D1','D2'].map(c => [c, 'accessible', 1.5])
];
