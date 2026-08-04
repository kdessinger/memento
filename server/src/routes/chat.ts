import express from 'express';
import { requireAuth } from '../middlewares/authMiddleware.js';
import * as chatService from '../services/chatService.js';

const router = express.Router();
router.use(requireAuth);

router.post('/', async (req, res) => {
  try {
    const userId = req.user!.userId;
    const { message, sessionId } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }

    const session = await chatService.getOrCreateSession(userId, sessionId);
    await chatService.saveMessage(session.id, 'user', message);
    await chatService.updateSessionTimestamp(session.id);

    const { reply, hermesSessionId } = await chatService.sendToHermes(
      userId,
      session.id,
      message,
      session.hermesSessionId
    );

    await chatService.saveMessage(session.id, 'assistant', reply);

    if (hermesSessionId && hermesSessionId !== session.hermesSessionId) {
      await chatService.updateHermesSessionId(session.id, hermesSessionId);
    }

    res.json({
      success: true,
      data: {
        sessionId: session.id,
        reply,
        hermesSessionId
      }
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ success: false, error: 'Failed to process chat message' });
  }
});

router.get('/sessions', async (req, res) => {
  try {
    const userId = req.user!.userId;
    const sessions = await chatService.listUserSessions(userId);
    res.json({ success: true, data: sessions });
  } catch (error) {
    console.error('List sessions error:', error);
    res.status(500).json({ success: false, error: 'Failed to list sessions' });
  }
});

router.get('/sessions/:sessionId/messages', async (req, res) => {
  try {
    const userId = req.user!.userId;
    const sessionId = parseInt(req.params.sessionId, 10);
    if (isNaN(sessionId)) {
      return res.status(400).json({ success: false, error: 'Invalid session ID' });
    }

    const messages = await chatService.getSessionMessages(sessionId);
    res.json({ success: true, data: messages });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ success: false, error: 'Failed to get messages' });
  }
});

export default router;
