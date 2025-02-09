import { pool } from '../config/database';
import { Contact, ContactResponse } from '../models/Contact';

export class ContactService {
  async identify(email: string | null, phoneNumber: string | null): Promise<ContactResponse> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Find existing contacts
      const existingContacts = await client.query<Contact>(
        `SELECT * FROM contacts 
         WHERE (email = $1 AND $1 IS NOT NULL) 
         OR (phone_number = $2 AND $2 IS NOT NULL)
         ORDER BY created_at ASC`,
        [email, phoneNumber]
      );

      // If no contacts exist, create a new primary contact
      if (existingContacts.rows.length === 0) {
        const newContact = await client.query<Contact>(
          `INSERT INTO contacts 
           (phone_number, email, link_precedence, created_at, updated_at) 
           VALUES ($1, $2, 'primary', NOW(), NOW()) 
           RETURNING *`,
          [phoneNumber, email]
        );

        await client.query('COMMIT');

        return {
          contact: {
            primaryContactId: newContact.rows[0].id,
            emails: email ? [email] : [],
            phoneNumbers: phoneNumber ? [phoneNumber] : [],
            secondaryContactIds: []
          }
        };
      }

      // Handle existing contacts
      let primaryContact = existingContacts.rows.find(c => c.linkPrecedence === 'primary');
      
      if (!primaryContact) {
        primaryContact = existingContacts.rows[0];
        // Update the oldest contact to be primary if none exists
        await client.query(
          `UPDATE contacts 
           SET link_precedence = 'primary', linked_id = NULL 
           WHERE id = $1`,
          [primaryContact.id]
        );
      }

      // Create new secondary contact if new information is provided
      if ((email && !existingContacts.rows.some(c => c.email === email)) ||
          (phoneNumber && !existingContacts.rows.some(c => c.phoneNumber === phoneNumber))) {
        await client.query(
          `INSERT INTO contacts 
           (phone_number, email, linked_id, link_precedence, created_at, updated_at)
           VALUES ($1, $2, $3, 'secondary', NOW(), NOW())`,
          [phoneNumber, email, primaryContact.id]
        );
      }

      // Get all related contacts
      const allContacts = await client.query<Contact>(
        `SELECT * FROM contacts 
         WHERE id = $1 
         OR linked_id = $1 
         ORDER BY created_at ASC`,
        [primaryContact.id]
      );

      await client.query('COMMIT');

      const emails = [...new Set(allContacts.rows
        .map(c => c.email)
        .filter((email): email is string => email !== null))];
      
      const phoneNumbers = [...new Set(allContacts.rows
        .map(c => c.phoneNumber)
        .filter((phone): phone is string => phone !== null))];

      const secondaryContactIds = allContacts.rows
        .filter(c => c.linkPrecedence === 'secondary')
        .map(c => c.id);

      return {
        contact: {
          primaryContactId: primaryContact.id,
          emails,
          phoneNumbers,
          secondaryContactIds
        }
      };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
} 