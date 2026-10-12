import prisma from '@/lib/prisma';

interface BookingForFlatRate {
    ServiceTypeID: number | null;
    Mileage: number;
    CarModel: string;
}

// Resolve the Flat Rate Description for each booking (same logic as the bay booking
// page: match service type + mileage value, prefer the rate of the booking's car model, then a model-less rate, then any).
// Returns the bookings with an extra `FlatRateDescription` field (null when none).
export async function withFlatRateDescription<T extends BookingForFlatRate>(
    bookings: T[]
): Promise<(T & { FlatRateDescription: string | null })[]> {
    const serviceTypeIds = [...new Set(bookings.filter(b => b.ServiceTypeID && b.Mileage > 0).map(b => b.ServiceTypeID!))];
    if (serviceTypeIds.length === 0) {
        return bookings.map(b => ({ ...b, FlatRateDescription: null }));
    }

    const rates = await prisma.cM_FlatRate.findMany({
        where: { IsActive: true, ServiceTypeID: { in: serviceTypeIds }, MileageID: { not: null } },
        select: {
            ServiceTypeID: true,
            Description: true,
            Mileage: { select: { Value: true } },
            CarModel: { select: { ModelName: true, Brand: true } },
        },
    });

    return bookings.map(b => {
        if (!b.ServiceTypeID || b.Mileage <= 0) return { ...b, FlatRateDescription: null };
        const candidates = rates.filter(r => r.ServiceTypeID === b.ServiceTypeID && r.Mileage?.Value === b.Mileage && r.Description?.trim());
        const modelRate = candidates.find(r => r.CarModel && (
            (r.CarModel.Brand ? `${r.CarModel.Brand} ${r.CarModel.ModelName}` : r.CarModel.ModelName) === b.CarModel
        ));
        const rate = modelRate ?? candidates.find(r => !r.CarModel) ?? candidates[0];
        return { ...b, FlatRateDescription: rate?.Description?.trim() || null };
    });
}
