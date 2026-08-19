// Role & Scope Permissions Utility

export function isCSRole(role?: string | null): boolean {
    return Boolean(role && (role === 'CS' || role.startsWith('CS_')));
}

export function getAllowedBookingType(userOrRole?: { allowedBookingType?: string | null; role?: string | null } | string | null): string | null {
    if (!userOrRole) return null;
    
    if (typeof userOrRole === 'string') {
        if (userOrRole.startsWith('CS_')) {
            return userOrRole.substring(3).toUpperCase();
        }
        return null;
    }

    if (userOrRole.allowedBookingType) {
        return userOrRole.allowedBookingType.toUpperCase();
    }

    if (userOrRole.role && userOrRole.role.startsWith('CS_')) {
        return userOrRole.role.substring(3).toUpperCase();
    }

    return null;
}

export function isProjectTypeMatchingAllowedType(
    projectType: string | null | undefined,
    allowedBookingType: string
): boolean {
    if (!projectType) return false;
    const cleanProject = projectType.toLowerCase().replace(/[\s\-_]/g, '');
    const cleanAllowed = allowedBookingType.toLowerCase().replace(/[\s\-_]/g, '');
    
    return cleanProject.includes(cleanAllowed) || cleanAllowed.includes(cleanProject);
}
