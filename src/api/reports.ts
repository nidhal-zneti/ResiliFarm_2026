import { apiRequest } from './client';

export type ProblemCategory =
  | 'irrigation'
  | 'leak'
  | 'cropHealth'
  | 'waterTank'
  | 'sensor'
  | 'other';

export type ProblemReport = {
  id: number;
  farm_id: number;
  category: ProblemCategory;
  description: string;
  photo_path?: string | null;
  status: 'open' | 'reviewing' | 'resolved';
  created_at: string;
};

export async function submitProblemReport(input: {
  farmId: number;
  category: ProblemCategory;
  description: string;
  photoUri?: string | null;
  photoName?: string;
  photoType?: string;
}) {
  const form = new FormData();
  form.append('farm_id', String(input.farmId));
  form.append('category', input.category);
  form.append('description', input.description);
  if (input.photoUri) {
    form.append('photo', {
      uri: input.photoUri,
      name: input.photoName ?? 'problem.jpg',
      type: input.photoType ?? 'image/jpeg',
    } as unknown as Blob);
  }
  return apiRequest<ProblemReport>(
    `/problem-reports?farm_id=${input.farmId}&category=${encodeURIComponent(input.category)}&description=${encodeURIComponent(input.description)}`,
    { method: 'POST', body: form },
  );
}

export async function getProblemReports(): Promise<ProblemReport[]> {
  return apiRequest<ProblemReport[]>('/problem-reports');
}
