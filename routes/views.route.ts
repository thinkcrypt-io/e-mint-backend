import { Router } from 'express';
import {
	trackView,
	updateViewEngagement,
	getAnalyticsSummary,
	getTopPages,
	getTrafficSources,
	getGeographicData,
	getRealTimeAnalytics,
	trackViewPost,
	updateViewEngagementPost,
	bulkTrackViews,
} from '../controllers/views/views.controller.js';

const router = Router();

// Public endpoint to track page views (original)
router.post('/track', trackView);

// New simplified post endpoint for frontend tracking
router.post('/track-view', trackViewPost);

// Bulk tracking endpoint for batch processing
router.post('/track-bulk', bulkTrackViews);

// Update view engagement metrics (original)
router.put('/engagement/:viewId', updateViewEngagement);

// New simplified post endpoint for engagement updates
router.put('/engagement-update/:viewId', updateViewEngagementPost);

// Analytics endpoints
router.get('/analytics/summary', getAnalyticsSummary);
router.get('/analytics/top-pages', getTopPages);
router.get('/analytics/traffic-sources', getTrafficSources);
router.get('/analytics/geographic', getGeographicData);
router.get('/analytics/realtime', getRealTimeAnalytics);

export default router;
