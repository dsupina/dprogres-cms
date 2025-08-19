import api from '@/lib/api';

export interface DashboardStats {
	totalPosts: number;
	totalPages: number;
	totalCategories: number;
	totalUsers: number;
	postsByStatus: Record<string, number>;
	recentPosts: any[];
	popularPosts: any[];
}

export const adminService = {
	getDashboard: async (): Promise<DashboardStats> => {
		const response = await api.get('/admin/dashboard');
		return response.data as DashboardStats;
	},
};


