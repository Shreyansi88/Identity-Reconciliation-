import { Router, RequestHandler } from 'express';
import { ContactService } from '../services/ContactService';

const router = Router();
const contactService = new ContactService();

const identifyHandler: RequestHandler = async (req, res) => {
  try {
    const { email, phoneNumber } = req.body;

    if (!email && !phoneNumber) {
      res.status(400).json({ error: 'Either email or phoneNumber is required' });
      return;
    }

    const result = await contactService.identify(email, phoneNumber);
    res.json(result);
  } catch (error) {
    console.error('Error in /identify:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

router.post('/identify', identifyHandler);

export default router; 