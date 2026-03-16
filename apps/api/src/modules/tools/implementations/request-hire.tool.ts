/**
 * request_hire tool
 * Agents call this when they need a specialist that doesn't exist yet.
 * Creates a HiringRequest for admin approval.
 */
import { createHiringRequest } from '../../company/hiring.service';

export async function requestHireTool(input: Record<string, unknown>, context: { agentId: string; projectId: string }): Promise<string> {
  const { role, department, skills, reason } = input as {
    role: string;
    department: string;
    skills: string[];
    reason: string;
  };

  if (!role || !department || !reason) throw new Error('role, department, and reason are required');

  const request = await createHiringRequest({
    requestedByAgentId: context.agentId,
    projectId: context.projectId,
    role,
    department,
    skills: skills ?? [],
    reason,
  });

  return `Hiring request created (ID: ${request.id}). A ${role} will be hired after admin approval. In the meantime, do your best with available resources.`;
}
