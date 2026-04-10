import apiClient from './client';

export async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  await apiClient.post('/user/change-password', { oldPassword, newPassword });
}
