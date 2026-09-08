using Microsoft.EntityFrameworkCore;
using RamyroShared.RIS.Events;
using RDBServiceInfrastructure;
using RDBServiceInfrastructure.DBContext;
using RDBServiceModels.Models.Finance;
using RDBServiceModels.Models.RIS;
using RISService.Application.Insurance;
using RISService.Application.Patients;
using RISService.Application.Procedures;
using RISService.Application.Scheduling;
using RISService.Domain.Procedures;
using RISService.Infrastructure.Messaging;
using PatientEntity = RDBServiceModels.Models.Patients.Patients;

namespace RISService.Application.Orders;

public class RisWorkflowService : IRisWorkflowService
{
    private readonly AppDbContext _dbContext;
    private readonly IRisEventPublisher _eventPublisher;
    private readonly ITenantContext _tenantContext;
    private readonly ICurrentUserService _currentUserService;
    private readonly IPatientTransliterationService _patientTransliteration;

    public RisWorkflowService(
        AppDbContext dbContext,
        IRisEventPublisher eventPublisher,
        ITenantContext tenantContext,
        ICurrentUserService currentUserService,
        IPatientTransliterationService patientTransliteration
    )
    {
        _dbContext = dbContext;
        _eventPublisher = eventPublisher;
        _tenantContext = tenantContext;
        _currentUserService = currentUserService;
        _patientTransliteration = patientTransliteration;
    }

    public async Task<RisRoomDto> CreateRoomAsync(
        CreateRisRoomRequest request,
        CancellationToken cancellationToken
    )
    {
        if (string.IsNullOrWhiteSpace(request.Code) || string.IsNullOrWhiteSpace(request.Name))
        {
            throw new ArgumentException("Room code and name are required.");
        }

        var branchExists = await _dbContext.EntityBranches.AnyAsync(
            b => b.Id == request.EntityBranchId,
            cancellationToken
        );
        if (!branchExists)
        {
            throw new ArgumentException($"Branch {request.EntityBranchId} was not found.");
        }

        var room = new RisRoom
        {
            EntityBranchId = request.EntityBranchId,
            Code = request.Code.Trim(),
            Name = request.Name.Trim(),
            Floor = NormalizeOptionalText(request.Floor),
            LocationDescription = NormalizeOptionalText(request.LocationDescription),
            Notes = NormalizeOptionalText(request.Notes),
            Status = request.Status,
        };

        foreach (var resource in request.Resources ?? Array.Empty<RisRoomResourceInput>())
        {
            room.Resources.Add(await BuildRoomResourceAsync(
                request.EntityBranchId,
                resource.RemoteNodeId,
                resource.ModalityId,
                resource.Code,
                resource.DisplayName,
                resource.ResourceType,
                resource.Manufacturer,
                resource.ModelName,
                resource.SerialNumber,
                resource.Notes,
                resource.SchedulingEnabled,
                resource.DefaultSlotMinutes,
                resource.Capacity,
                resource.OperationalStatus,
                true,
                cancellationToken
            ));
        }

        _dbContext.RisRooms.Add(room);
        await _dbContext.SaveChangesAsync(cancellationToken);

        return await GetRoomDtoAsync(room.Id, cancellationToken)
            ?? throw new InvalidOperationException("Room was created but could not be reloaded.");
    }

    public async Task<RisRoomDto?> UpdateRoomAsync(
        int roomId,
        UpdateRisRoomRequest request,
        CancellationToken cancellationToken
    )
    {
        if (string.IsNullOrWhiteSpace(request.Code) || string.IsNullOrWhiteSpace(request.Name))
        {
            throw new ArgumentException("Room code and name are required.");
        }

        if (!Enum.IsDefined(request.Status))
        {
            throw new ArgumentException("Unsupported room status.");
        }

        var branchExists = await _dbContext.EntityBranches.AnyAsync(
            b => b.Id == request.EntityBranchId,
            cancellationToken
        );
        if (!branchExists)
        {
            throw new ArgumentException($"Branch {request.EntityBranchId} was not found.");
        }

        var room = await _dbContext.RisRooms
            .FirstOrDefaultAsync(r => r.Id == roomId, cancellationToken);
        if (room == null)
        {
            return null;
        }

        room.EntityBranchId = request.EntityBranchId;
        room.Code = request.Code.Trim();
        room.Name = request.Name.Trim();
        room.Floor = NormalizeOptionalText(request.Floor);
        room.LocationDescription = NormalizeOptionalText(request.LocationDescription);
        room.Notes = NormalizeOptionalText(request.Notes);
        room.Status = request.Status;

        await _dbContext.SaveChangesAsync(cancellationToken);
        return await GetRoomDtoAsync(room.Id, cancellationToken);
    }

    public async Task<IReadOnlyList<RisRoomDto>> GetRoomsAsync(
        int? branchId,
        CancellationToken cancellationToken
    )
    {
        var query = _dbContext.RisRooms
            .Include(r => r.Resources)
                .ThenInclude(rr => rr.RemoteNode)
            .Include(r => r.Resources)
                .ThenInclude(rr => rr.Modality)
            .AsNoTracking()
            .AsQueryable();

        if (branchId.HasValue)
        {
            query = query.Where(r => r.EntityBranchId == branchId.Value);
        }

        return await query
            .OrderBy(r => r.Name)
            .Select(r => ToRoomDto(r))
            .ToListAsync(cancellationToken);
    }

    public async Task<RisRoomResourceDto> CreateRoomResourceAsync(
        int roomId,
        CreateRisRoomResourceRequest request,
        CancellationToken cancellationToken
    )
    {
        var room = await _dbContext.RisRooms
            .AsNoTracking()
            .FirstOrDefaultAsync(r => r.Id == roomId, cancellationToken)
            ?? throw new ArgumentException($"RIS room {roomId} was not found.");

        var resource = await BuildRoomResourceAsync(
            room.EntityBranchId,
            request.RemoteNodeId,
            request.ModalityId,
            request.Code,
            request.DisplayName,
            request.ResourceType,
            request.Manufacturer,
            request.ModelName,
            request.SerialNumber,
            request.Notes,
            request.SchedulingEnabled,
            request.DefaultSlotMinutes,
            request.Capacity,
            request.OperationalStatus,
            request.IsActive ?? true,
            cancellationToken
        );
        resource.RoomId = roomId;

        _dbContext.RisRoomResources.Add(resource);
        await _dbContext.SaveChangesAsync(cancellationToken);

        return await _dbContext.RisRoomResources
            .Include(r => r.Room)
            .Include(r => r.RemoteNode)
            .Include(r => r.Modality)
            .AsNoTracking()
            .Where(r => r.Id == resource.Id)
            .Select(r => ToRoomResourceDto(r))
            .FirstAsync(cancellationToken);
    }

    public async Task<RisRoomResourceDto?> UpdateRoomResourceAsync(
        int roomResourceId,
        UpdateRisRoomResourceRequest request,
        CancellationToken cancellationToken
    )
    {
        if (!Enum.IsDefined(request.OperationalStatus))
        {
            throw new ArgumentException("Unsupported machine operational status.");
        }

        var room = await _dbContext.RisRooms
            .AsNoTracking()
            .FirstOrDefaultAsync(r => r.Id == request.RoomId, cancellationToken)
            ?? throw new ArgumentException($"RIS room {request.RoomId} was not found.");

        var resource = await _dbContext.RisRoomResources
            .FirstOrDefaultAsync(r => r.Id == roomResourceId, cancellationToken);
        if (resource == null)
        {
            return null;
        }

        var updated = await BuildRoomResourceAsync(
            room.EntityBranchId,
            request.RemoteNodeId,
            request.ModalityId,
            request.Code,
            request.DisplayName,
            request.ResourceType,
            request.Manufacturer,
            request.ModelName,
            request.SerialNumber,
            request.Notes,
            request.SchedulingEnabled,
            request.DefaultSlotMinutes,
            request.Capacity,
            request.OperationalStatus,
            request.IsActive,
            cancellationToken
        );

        resource.RoomId = request.RoomId;
        resource.RemoteNodeId = updated.RemoteNodeId;
        resource.ModalityId = updated.ModalityId;
        resource.Code = updated.Code;
        resource.DisplayName = updated.DisplayName;
        resource.ResourceType = updated.ResourceType;
        resource.Manufacturer = updated.Manufacturer;
        resource.ModelName = updated.ModelName;
        resource.SerialNumber = updated.SerialNumber;
        resource.Notes = updated.Notes;
        resource.SchedulingEnabled = updated.SchedulingEnabled;
        resource.DefaultSlotMinutes = updated.DefaultSlotMinutes;
        resource.Capacity = updated.Capacity;
        resource.OperationalStatus = updated.OperationalStatus;
        resource.IsActive = updated.IsActive;

        await _dbContext.SaveChangesAsync(cancellationToken);

        return await _dbContext.RisRoomResources
            .Include(r => r.Room)
            .Include(r => r.RemoteNode)
            .Include(r => r.Modality)
            .AsNoTracking()
            .Where(r => r.Id == roomResourceId)
            .Select(r => ToRoomResourceDto(r))
            .FirstAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<RisRoomResourceDto>> GetRoomResourcesAsync(
        int? branchId,
        int? roomId,
        int? modalityId,
        bool includeInactive,
        CancellationToken cancellationToken
    )
    {
        var resources = _dbContext.RisRoomResources
            .Include(r => r.Room)
            .Include(r => r.RemoteNode)
            .Include(r => r.Modality)
            .AsNoTracking()
            .AsQueryable();

        if (branchId.HasValue)
        {
            resources = resources.Where(r => r.Room != null && r.Room.EntityBranchId == branchId.Value);
        }

        if (roomId.HasValue)
        {
            resources = resources.Where(r => r.RoomId == roomId.Value);
        }

        if (modalityId.HasValue)
        {
            resources = resources.Where(r => r.ModalityId == modalityId.Value);
        }

        if (!includeInactive)
        {
            resources = resources.Where(r =>
                r.IsActive
                && r.SchedulingEnabled
                && (r.OperationalStatus == RisRoomResourceOperationalStatus.Operating
                    || r.OperationalStatus == RisRoomResourceOperationalStatus.Idle)
                && r.Room != null
                && r.Room.Status == RisRoomStatus.Active);
        }

        return await resources
            .OrderBy(r => r.Room == null ? string.Empty : r.Room.Name)
            .ThenBy(r => r.DisplayName ?? r.Code)
            .Select(r => ToRoomResourceDto(r))
            .ToListAsync(cancellationToken);
    }

    public async Task<RisRoomResourceDto> UpdateRoomResourceStatusAsync(
        int roomResourceId,
        UpdateRisRoomResourceStatusRequest request,
        CancellationToken cancellationToken
    )
    {
        if (!Enum.IsDefined(request.OperationalStatus))
        {
            throw new ArgumentException("Unsupported machine operational status.");
        }

        var resource = await _dbContext.RisRoomResources
            .FirstOrDefaultAsync(r => r.Id == roomResourceId, cancellationToken)
            ?? throw new ArgumentException($"RIS room resource {roomResourceId} was not found.");

        resource.OperationalStatus = request.OperationalStatus;

        var notes = NormalizeOptionalText(request.Notes);
        if (notes != null)
        {
            resource.Notes = notes;
        }

        await _dbContext.SaveChangesAsync(cancellationToken);

        return await _dbContext.RisRoomResources
            .Include(r => r.Room)
            .Include(r => r.RemoteNode)
            .Include(r => r.Modality)
            .AsNoTracking()
            .Where(r => r.Id == roomResourceId)
            .Select(r => ToRoomResourceDto(r))
            .FirstAsync(cancellationToken);
    }

    public async Task<RisSchedulingPolicyDto> UpsertSchedulingPolicyAsync(
        UpsertRisSchedulingPolicyRequest request,
        CancellationToken cancellationToken
    )
    {
        if (request.DefaultSlotMinutes <= 0)
        {
            throw new ArgumentException("Default slot minutes must be greater than zero.");
        }

        if (request.DefaultCapacityPerResource <= 0)
        {
            throw new ArgumentException("Default capacity per resource must be greater than zero.");
        }

        var branchExists = await _dbContext.EntityBranches.AnyAsync(
            b => b.Id == request.EntityBranchId,
            cancellationToken
        );
        if (!branchExists)
        {
            throw new ArgumentException($"Branch {request.EntityBranchId} was not found.");
        }

        var policy = await _dbContext.RisSchedulingPolicies.FirstOrDefaultAsync(
            p => p.EntityBranchId == request.EntityBranchId,
            cancellationToken
        );

        if (policy == null)
        {
            policy = new RisSchedulingPolicy { EntityBranchId = request.EntityBranchId };
            _dbContext.RisSchedulingPolicies.Add(policy);
        }

        policy.EnforceAvailability = request.EnforceAvailability;
        policy.AllowOverbooking = request.AllowOverbooking;
        policy.DefaultSlotMinutes = request.DefaultSlotMinutes;
        policy.DefaultCapacityPerResource = request.DefaultCapacityPerResource;

        await _dbContext.SaveChangesAsync(cancellationToken);
        return ToSchedulingPolicyDto(policy);
    }

    public async Task<RisSchedulingPolicyDto> GetSchedulingPolicyAsync(
        int branchId,
        CancellationToken cancellationToken
    )
    {
        var policy = await GetSchedulingPolicyEntityAsync(branchId, cancellationToken);
        return ToSchedulingPolicyDto(policy);
    }

    public async Task<RisRoomResourceShiftDto> CreateRoomResourceShiftAsync(
        int roomResourceId,
        CreateRisRoomResourceShiftRequest request,
        CancellationToken cancellationToken
    )
    {
        if (request.EndTime <= request.StartTime)
        {
            throw new ArgumentException("Shift end time must be after start time.");
        }

        var resource = await _dbContext.RisRoomResources
            .Include(r => r.Room)
            .FirstOrDefaultAsync(r => r.Id == roomResourceId, cancellationToken)
            ?? throw new ArgumentException($"RIS room resource {roomResourceId} was not found.");

        var policy = resource.Room == null
            ? DefaultSchedulingPolicy(0)
            : await GetSchedulingPolicyEntityAsync(resource.Room.EntityBranchId, cancellationToken);

        var slotMinutes = request.SlotMinutes
            ?? resource.DefaultSlotMinutes
            ?? policy.DefaultSlotMinutes;
        var capacity = request.Capacity
            ?? resource.Capacity
            ?? policy.DefaultCapacityPerResource;

        if (slotMinutes <= 0)
        {
            throw new ArgumentException("Slot minutes must be greater than zero.");
        }

        if (capacity <= 0)
        {
            throw new ArgumentException("Capacity must be greater than zero.");
        }

        var shift = new RisRoomResourceShift
        {
            RoomResourceId = roomResourceId,
            DayOfWeek = request.DayOfWeek,
            StartTime = request.StartTime,
            EndTime = request.EndTime,
            SlotMinutes = slotMinutes,
            Capacity = capacity,
            EffectiveFromUtc = request.EffectiveFromUtc,
            EffectiveToUtc = request.EffectiveToUtc,
            IsActive = request.IsActive,
        };

        _dbContext.RisRoomResourceShifts.Add(shift);
        await _dbContext.SaveChangesAsync(cancellationToken);
        return ToShiftDto(shift);
    }

    public async Task<IReadOnlyList<RisRoomResourceShiftDto>> ReplaceRoomResourceShiftsAsync(
        int roomResourceId,
        IReadOnlyList<CreateRisRoomResourceShiftRequest> requests,
        CancellationToken cancellationToken
    )
    {
        var resource = await _dbContext.RisRoomResources
            .Include(r => r.Room)
            .FirstOrDefaultAsync(r => r.Id == roomResourceId, cancellationToken)
            ?? throw new ArgumentException($"RIS room resource {roomResourceId} was not found.");

        var policy = resource.Room == null
            ? DefaultSchedulingPolicy(0)
            : await GetSchedulingPolicyEntityAsync(resource.Room.EntityBranchId, cancellationToken);

        var replacementShifts = new List<RisRoomResourceShift>();
        foreach (var request in requests)
        {
            if (request.EndTime <= request.StartTime)
            {
                throw new ArgumentException("Shift end time must be after start time.");
            }

            var slotMinutes = request.SlotMinutes
                ?? resource.DefaultSlotMinutes
                ?? policy.DefaultSlotMinutes;
            var capacity = request.Capacity
                ?? resource.Capacity
                ?? policy.DefaultCapacityPerResource;

            if (slotMinutes <= 0)
            {
                throw new ArgumentException("Slot minutes must be greater than zero.");
            }

            if (capacity <= 0)
            {
                throw new ArgumentException("Capacity must be greater than zero.");
            }

            replacementShifts.Add(new RisRoomResourceShift
            {
                RoomResourceId = roomResourceId,
                DayOfWeek = request.DayOfWeek,
                StartTime = request.StartTime,
                EndTime = request.EndTime,
                SlotMinutes = slotMinutes,
                Capacity = capacity,
                EffectiveFromUtc = request.EffectiveFromUtc,
                EffectiveToUtc = request.EffectiveToUtc,
                IsActive = request.IsActive,
            });
        }

        var existingShifts = await _dbContext.RisRoomResourceShifts
            .Where(s => s.RoomResourceId == roomResourceId)
            .ToListAsync(cancellationToken);

        _dbContext.RisRoomResourceShifts.RemoveRange(existingShifts);
        _dbContext.RisRoomResourceShifts.AddRange(replacementShifts);
        await _dbContext.SaveChangesAsync(cancellationToken);

        return replacementShifts
            .OrderBy(s => s.DayOfWeek)
            .ThenBy(s => s.StartTime)
            .Select(ToShiftDto)
            .ToList();
    }

    public async Task<IReadOnlyList<RisRoomResourceShiftDto>> GetRoomResourceShiftsAsync(
        int roomResourceId,
        CancellationToken cancellationToken
    )
    {
        var resourceExists = await _dbContext.RisRoomResources.AnyAsync(
            r => r.Id == roomResourceId,
            cancellationToken
        );
        if (!resourceExists)
        {
            throw new ArgumentException($"RIS room resource {roomResourceId} was not found.");
        }

        return await _dbContext.RisRoomResourceShifts
            .Where(s => s.RoomResourceId == roomResourceId)
            .OrderBy(s => s.DayOfWeek)
            .ThenBy(s => s.StartTime)
            .Select(s => ToShiftDto(s))
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<RisAvailableSlotDto>> GetAvailableSlotsAsync(
        int branchId,
        int procedureId,
        DateTime fromUtc,
        DateTime toUtc,
        int? roomId,
        int? roomResourceId,
        CancellationToken cancellationToken
    )
    {
        if (toUtc <= fromUtc)
        {
            throw new ArgumentException("toUtc must be after fromUtc.");
        }

        var procedure = await _dbContext.Procedures.AsNoTracking().FirstOrDefaultAsync(
            p => p.Id == procedureId && p.EntityBranchId == branchId && p.IsActive,
            cancellationToken
        ) ?? throw new ArgumentException($"Active procedure {procedureId} was not found in branch {branchId}.");

        var policy = await GetSchedulingPolicyEntityAsync(branchId, cancellationToken);
        var procedureMinutes = procedure.TimeInMinutes.GetValueOrDefault(policy.DefaultSlotMinutes);

        var shifts = await _dbContext.RisRoomResourceShifts
            .Include(s => s.RoomResource)
                .ThenInclude(r => r!.Room)
            .Include(s => s.RoomResource)
                .ThenInclude(r => r!.RemoteNode)
            .Where(s =>
                s.IsActive
                && s.RoomResource != null
                && s.RoomResource.IsActive
                && s.RoomResource.SchedulingEnabled
                && (s.RoomResource.OperationalStatus == RisRoomResourceOperationalStatus.Operating
                    || s.RoomResource.OperationalStatus == RisRoomResourceOperationalStatus.Idle)
                && s.RoomResource.Room != null
                && s.RoomResource.Room.EntityBranchId == branchId
                && s.RoomResource.Room.Status == RisRoomStatus.Active
                && (
                    s.RoomResource.ModalityId == null
                    || s.RoomResource.ModalityId == procedure.ModalityId
                    || (s.RoomResource.RemoteNode != null
                        && s.RoomResource.RemoteNode.ModalityId == procedure.ModalityId)
                )
                && (!roomId.HasValue || s.RoomResource.RoomId == roomId.Value)
                && (!roomResourceId.HasValue || s.RoomResourceId == roomResourceId.Value)
                && (!s.EffectiveFromUtc.HasValue || s.EffectiveFromUtc.Value <= toUtc)
                && (!s.EffectiveToUtc.HasValue || s.EffectiveToUtc.Value >= fromUtc))
            .AsNoTracking()
            .ToListAsync(cancellationToken);

        var slots = new List<RisAvailableSlotDto>();
        foreach (var shift in shifts)
        {
            var generated = GenerateSlotsForShift(shift, fromUtc, toUtc, procedureMinutes);
            foreach (var (start, end) in generated)
            {
                var bookedCount = await CountOverlappingOrdersAsync(
                    shift.RoomResourceId,
                    start,
                    end,
                    policy.DefaultSlotMinutes,
                    cancellationToken
                );

                slots.Add(new RisAvailableSlotDto(
                    shift.RoomResource!.RoomId,
                    shift.RoomResource.Room?.Code,
                    shift.RoomResource.Room?.Name,
                    shift.RoomResourceId,
                    shift.RoomResource.ModalityId,
                    shift.RoomResource.RemoteNodeId,
                    shift.RoomResource.Code,
                    shift.RoomResource.DisplayName,
                    shift.RoomResource.DisplayName,
                    shift.RoomResource.RemoteNode?.AETitle,
                    start,
                    end,
                    shift.Capacity,
                    bookedCount,
                    bookedCount < shift.Capacity
                ));
            }
        }

        return slots.OrderBy(s => s.StartUtc).ThenBy(s => s.RoomResourceId).ToList();
    }

    public async Task<IReadOnlyList<RisSchedulingConflictDto>> GetSchedulingConflictsAsync(
        int branchId,
        DateTime fromUtc,
        DateTime toUtc,
        int? roomResourceId,
        CancellationToken cancellationToken
    )
    {
        if (toUtc <= fromUtc)
        {
            throw new ArgumentException("toUtc must be after fromUtc.");
        }

        var policy = await GetSchedulingPolicyEntityAsync(branchId, cancellationToken);
        var orders = await GetOrdersInRangeAsync(branchId, fromUtc, toUtc, roomResourceId, cancellationToken);
        var conflicts = new List<RisSchedulingConflictDto>();

        foreach (var order in orders)
        {
            if (!order.RoomResourceId.HasValue)
            {
                continue;
            }

            var start = order.ScheduledStartUtc;
            var end = ResolveOrderEnd(order, policy.DefaultSlotMinutes);
            var capacity = await ResolveCapacityAsync(
                order.RoomResourceId.Value,
                start,
                end,
                policy.DefaultCapacityPerResource,
                cancellationToken
            );
            var overlapping = orders
                .Where(o =>
                    o.RoomResourceId == order.RoomResourceId
                    && o.ScheduledStartUtc < end
                    && ResolveOrderEnd(o, policy.DefaultSlotMinutes) > start)
                .ToList();

            if (overlapping.Count > capacity)
            {
                conflicts.Add(new RisSchedulingConflictDto(
                    order.RoomResourceId.Value,
                    order.RoomId,
                    order.RoomResource?.Room?.Name,
                    order.RoomResource?.DisplayName,
                    order.RoomResource?.DisplayName,
                    start,
                    end,
                    capacity,
                    overlapping.Count,
                    overlapping.Select(o => o.Id).Distinct().OrderBy(id => id).ToList(),
                    $"Room resource {order.RoomResourceId.Value} has {overlapping.Count} overlapping orders for capacity {capacity}."
                ));
            }
        }

        return conflicts
            .GroupBy(c => new { c.RoomResourceId, c.StartUtc, c.EndUtc })
            .Select(g => g.First())
            .OrderBy(c => c.StartUtc)
            .ToList();
    }

    public async Task<int> CreatePrerequisiteRuleAsync(
        CreatePrerequisiteRuleRequest request,
        CancellationToken cancellationToken
    )
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            throw new ArgumentException("Prerequisite name is required.");
        }

        var procedureExists = await _dbContext.Procedures.AnyAsync(
            p => p.Id == request.ProcedureId,
            cancellationToken
        );
        if (!procedureExists)
        {
            throw new ArgumentException($"Procedure {request.ProcedureId} was not found.");
        }

        if (request.SubTypeId.HasValue)
        {
            _ = await _dbContext.RisPrerequisiteSubTypes
                .AsNoTracking()
                .FirstOrDefaultAsync(
                    s =>
                        s.Id == request.SubTypeId.Value
                        && s.Type == request.Type
                        && s.IsActive,
                    cancellationToken
                )
                ?? throw new ArgumentException(
                    $"Active prerequisite subtype {request.SubTypeId.Value} was not found for type {request.Type}."
                );
        }

        var rule = new RisProcedurePrerequisiteRule
        {
            ProcedureId = request.ProcedureId,
            Type = request.Type,
            SubTypeId = request.SubTypeId,
            Name = request.Name.Trim(),
            Description = request.Description,
            RequiredGender = request.RequiredGender,
            IsRequired = request.IsRequired,
            IsActive = request.IsActive,
        };

        _dbContext.RisProcedurePrerequisiteRules.Add(rule);
        await _dbContext.SaveChangesAsync(cancellationToken);
        return rule.Id;
    }

    public async Task<RisPrerequisiteSubTypeDto> CreatePrerequisiteSubTypeAsync(
        CreatePrerequisiteSubTypeRequest request,
        CancellationToken cancellationToken
    )
    {
        if (string.IsNullOrWhiteSpace(request.Code) || string.IsNullOrWhiteSpace(request.Name))
        {
            throw new ArgumentException("Prerequisite subtype code and name are required.");
        }

        var code = request.Code.Trim();
        var exists = await _dbContext.RisPrerequisiteSubTypes.AnyAsync(
            s => s.Type == request.Type && s.Code == code,
            cancellationToken
        );
        if (exists)
        {
            throw new ArgumentException(
                $"Prerequisite subtype code '{code}' already exists for type {request.Type}."
            );
        }

        var subType = new RisPrerequisiteSubType
        {
            Type = request.Type,
            Code = code,
            Name = request.Name.Trim(),
            Description = NormalizeOptionalText(request.Description),
            IsActive = request.IsActive,
        };

        _dbContext.RisPrerequisiteSubTypes.Add(subType);
        await _dbContext.SaveChangesAsync(cancellationToken);
        return ToPrerequisiteSubTypeDto(subType);
    }

    public async Task<IReadOnlyList<RisPrerequisiteSubTypeDto>> GetPrerequisiteSubTypesAsync(
        RisPrerequisiteType? type,
        bool includeInactive,
        CancellationToken cancellationToken
    )
    {
        var query = _dbContext.RisPrerequisiteSubTypes.AsNoTracking().AsQueryable();

        if (type.HasValue)
        {
            query = query.Where(s => s.Type == type.Value);
        }

        if (!includeInactive)
        {
            query = query.Where(s => s.IsActive);
        }

        return await query
            .OrderBy(s => s.Type)
            .ThenBy(s => s.Name)
            .Select(s => new RisPrerequisiteSubTypeDto(
                s.Id,
                s.Type,
                s.Code,
                s.Name,
                s.Description,
                s.IsActive
            ))
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<RisPrerequisiteDto>> GetProcedurePrerequisitesAsync(
        int procedureId,
        CancellationToken cancellationToken
    )
    {
        var procedureExists = await _dbContext.Procedures.AnyAsync(
            p => p.Id == procedureId,
            cancellationToken
        );
        if (!procedureExists)
        {
            throw new ArgumentException($"Procedure {procedureId} was not found.");
        }

        return await _dbContext.RisProcedurePrerequisiteRules
            .Where(r => r.ProcedureId == procedureId && r.IsActive)
            .OrderBy(r => r.Type)
            .ThenBy(r => r.SubType == null ? string.Empty : r.SubType.Name)
            .ThenBy(r => r.Name)
            .Select(r => new RisPrerequisiteDto(
                r.Id,
                r.Id,
                r.Type,
                r.SubTypeId,
                r.SubType == null ? null : r.SubType.Code,
                r.SubType == null ? null : r.SubType.Name,
                r.Name,
                r.IsRequired,
                RisPrerequisiteStatus.Pending,
                r.RequiredGender,
                r.Description
            ))
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<RisPatientSearchDto>> SearchPatientsAsync(
        string? query,
        string? phone,
        string? ssn,
        string? patientId,
        CancellationToken cancellationToken
    )
    {
        var patients = _dbContext.Patients.AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(patientId))
        {
            var value = patientId.Trim();
            patients = patients.Where(p => p.PatientID != null && p.PatientID.Contains(value));
        }

        if (!string.IsNullOrWhiteSpace(phone))
        {
            var value = NormalizePhoneNumber(phone);
            if (value != null)
            {
                patients = WherePhoneNumberEquals(patients, value);
            }
        }

        if (!string.IsNullOrWhiteSpace(ssn))
        {
            var value = ssn.Trim();
            patients = patients.Where(p => p.SSN != null && p.SSN.Contains(value));
        }

        if (!string.IsNullOrWhiteSpace(query))
        {
            var value = query.Trim();
            patients = patients.Where(p =>
                (p.FullName != null && p.FullName.Contains(value))
                || (p.PatientName != null && p.PatientName.Contains(value))
                || (p.LocalFirstName != null && p.LocalFirstName.Contains(value))
                || (p.LocalMiddleName != null && p.LocalMiddleName.Contains(value))
                || (p.LocalLastName != null && p.LocalLastName.Contains(value))
                || (p.LocalOtherPatientNames != null && p.LocalOtherPatientNames.Contains(value))
                || (p.PatientID != null && p.PatientID.Contains(value))
                || (p.PhoneNumber != null && p.PhoneNumber.Contains(value))
                || (p.SSN != null && p.SSN.Contains(value)));
        }

        return await patients
            .OrderBy(p => p.FullName ?? p.PatientName ?? p.PatientID)
            .Take(50)
            .Select(p => new RisPatientSearchDto(
                p.Id,
                p.PatientID,
                p.FullName ?? p.PatientName,
                p.FirstName,
                p.MiddleName,
                p.LastName,
                p.SSN,
                p.PhoneNumber,
                p.Gender,
                p.DateOfBirth
            ))
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<RisProcedureSearchDto>> SearchProceduresAsync(
        int? branchId,
        int? modalityId,
        string? query,
        CancellationToken cancellationToken
    )
    {
        var procedures = _dbContext.Procedures.AsNoTracking().Where(p => p.IsActive);

        if (branchId.HasValue)
        {
            procedures = procedures.Where(p => p.EntityBranchId == branchId.Value);
        }

        if (modalityId.HasValue)
        {
            procedures = procedures.Where(p => p.ModalityId == modalityId.Value);
        }

        if (!string.IsNullOrWhiteSpace(query))
        {
            var value = query.Trim();
            procedures = procedures.Where(p =>
                p.DisplayName.Contains(value)
                || (p.ProcedureCode != null && p.ProcedureCode.Contains(value))
                || (p.NameR != null && p.NameR.Contains(value))
                || (p.NameL != null && p.NameL.Contains(value)));
        }

        return await procedures
            .OrderBy(p => p.DisplayName)
            .Take(100)
            .Select(p => new RisProcedureSearchDto(
                p.Id,
                p.EntityBranchId,
                p.ModalityId,
                p.DisplayName,
                p.ProcedureCode,
                p.TimeInMinutes,
                p.IsActive
            ))
            .ToListAsync(cancellationToken);
    }

    public async Task<RisInsuranceCompanyDto> UpsertInsuranceCompanyAsync(
        UpsertRisInsuranceCompanyRequest request,
        CancellationToken cancellationToken
    )
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            throw new ArgumentException("Insurance company name is required.");
        }

        var priceList = await _dbContext.PriceLists
            .Include(pl => pl.EntityBranch)
            .FirstOrDefaultAsync(pl => pl.Id == request.PriceListId, cancellationToken)
            ?? throw new ArgumentException($"Price list {request.PriceListId} was not found.");

        if (priceList.Type != PriceListType.InsuranceList)
        {
            throw new ArgumentException($"Price list {request.PriceListId} must be an insurance price list.");
        }

        RisInsuranceCompany company;
        if (request.Id.HasValue)
        {
            company = await _dbContext.RisInsuranceCompanies
                .FirstOrDefaultAsync(c => c.Id == request.Id.Value, cancellationToken)
                ?? throw new ArgumentException($"Insurance company {request.Id.Value} was not found.");
        }
        else
        {
            company = new RisInsuranceCompany();
            _dbContext.RisInsuranceCompanies.Add(company);
        }

        company.Code = NormalizeOptionalText(request.Code);
        company.Name = request.Name.Trim();
        company.ContactName = NormalizeOptionalText(request.ContactName);
        company.PhoneNumber = NormalizePhoneNumber(request.PhoneNumber);
        company.Email = NormalizeOptionalText(request.Email);
        company.Address = NormalizeOptionalText(request.Address);
        company.ContractNumber = NormalizeOptionalText(request.ContractNumber);
        company.ContractStartUtc = NormalizeScheduledUtc(request.ContractStartUtc);
        company.ContractEndUtc = NormalizeScheduledUtc(request.ContractEndUtc);
        company.PriceListId = priceList.Id;
        company.PriceList = priceList;
        company.IsActive = request.IsActive;
        company.Notes = NormalizeOptionalText(request.Notes);

        await _dbContext.SaveChangesAsync(cancellationToken);
        return ToInsuranceCompanyDto(company);
    }

    public async Task<IReadOnlyList<RisInsuranceCompanyDto>> SearchInsuranceCompaniesAsync(
        int? branchId,
        string? query,
        bool includeInactive,
        CancellationToken cancellationToken
    )
    {
        var companies = _dbContext.RisInsuranceCompanies
            .AsNoTracking()
            .Include(c => c.PriceList)
                .ThenInclude(pl => pl!.EntityBranch)
            .AsQueryable();

        if (!includeInactive)
        {
            companies = companies.Where(c => c.IsActive);
        }

        if (branchId.HasValue)
        {
            companies = companies.Where(c =>
                c.PriceList != null
                && (!c.PriceList.EntityBranchId.HasValue || c.PriceList.EntityBranchId == branchId.Value));
        }

        if (!string.IsNullOrWhiteSpace(query))
        {
            var value = query.Trim();
            companies = companies.Where(c =>
                c.Name.Contains(value)
                || (c.Code != null && c.Code.Contains(value))
                || (c.ContractNumber != null && c.ContractNumber.Contains(value)));
        }

        return await companies
            .OrderBy(c => c.Name)
            .Take(100)
            .Select(c => new RisInsuranceCompanyDto(
                c.Id,
                c.Code,
                c.Name,
                c.ContactName,
                c.PhoneNumber,
                c.Email,
                c.Address,
                c.ContractNumber,
                c.ContractStartUtc,
                c.ContractEndUtc,
                c.PriceListId,
                c.PriceList == null ? null : c.PriceList.Name,
                c.PriceList == null ? null : c.PriceList.EntityBranchId,
                c.PriceList == null || c.PriceList.EntityBranch == null ? null : c.PriceList.EntityBranch.Name,
                c.IsActive,
                c.Notes
            ))
            .ToListAsync(cancellationToken);
    }

    public async Task<RisProcedurePriceDto?> GetProcedurePriceAsync(
        int? branchId,
        RisPayerType payerType,
        int? insuranceCompanyId,
        int? procedureId,
        string? procedureName,
        CancellationToken cancellationToken
    )
    {
        var normalizedProcedureName = NormalizeOptionalText(procedureName);
        if (!procedureId.HasValue && normalizedProcedureName == null)
        {
            throw new ArgumentException("Either procedureId or procedureName is required.");
        }

        ProcedurePriceProjection? pricing;
        if (payerType == RisPayerType.SelfPay)
        {
            if (!branchId.HasValue)
            {
                throw new ArgumentException("branchId is required for self-pay procedure pricing.");
            }

            pricing = await FindCashProcedurePriceAsync(
                branchId.Value,
                procedureId,
                normalizedProcedureName,
                cancellationToken
            );
        }
        else
        {
            if (!insuranceCompanyId.HasValue)
            {
                throw new ArgumentException("insuranceCompanyId is required for insurance procedure pricing.");
            }

            pricing = await FindInsuranceProcedurePriceAsync(
                insuranceCompanyId.Value,
                branchId,
                procedureId,
                normalizedProcedureName,
                cancellationToken
            );
        }

        return pricing == null ? null : ToProcedurePriceDto(payerType, pricing);
    }

    public async Task<RisProcedureInsurancePriceDto?> GetProcedureInsurancePriceAsync(
        int insuranceCompanyId,
        int? procedureId,
        string? procedureName,
        CancellationToken cancellationToken
    )
    {
        var pricing = await GetProcedurePriceAsync(
            null,
            RisPayerType.Insurance,
            insuranceCompanyId,
            procedureId,
            procedureName,
            cancellationToken
        );

        if (pricing == null)
        {
            return null;
        }

        return new RisProcedureInsurancePriceDto(
            pricing.InsuranceCompanyId ?? insuranceCompanyId,
            pricing.InsuranceCompanyName ?? string.Empty,
            pricing.PriceListId,
            pricing.PriceListName,
            pricing.ProcedureId,
            pricing.ProcedureName,
            pricing.ProcedureCode,
            pricing.ProcedurePricingId,
            pricing.Price,
            pricing.VatPercentage,
            pricing.VatAmount,
            pricing.TotalPrice,
            pricing.CurrencyId,
            pricing.CurrencyCode,
            pricing.CurrencyName,
            pricing.CurrencySymbol,
            pricing.ExternalReferenceCode,
            pricing.Notes
        );
    }

    private async Task<ProcedurePriceProjection?> FindCashProcedurePriceAsync(
        int branchId,
        int? procedureId,
        string? normalizedProcedureName,
        CancellationToken cancellationToken
    )
    {
        var now = DateTime.UtcNow;
        var query = _dbContext.ProcedurePricings
            .AsNoTracking()
            .Where(pp =>
                pp.PriceList != null
                && pp.PriceList.Type == PriceListType.CashList
                && (pp.PriceList.EntityBranchId == branchId || pp.PriceList.EntityBranchId == null)
                && (!procedureId.HasValue || pp.ProcedureId == procedureId.Value)
                && pp.IsActive
                && pp.PriceList.Status == PriceListStatus.Active
                && pp.PriceList.EffectiveFrom <= now
                && (!pp.PriceList.EffectiveTo.HasValue || pp.PriceList.EffectiveTo >= now));

        if (normalizedProcedureName != null)
        {
            query = query.Where(pp =>
                pp.Procedure != null
                && (pp.Procedure.DisplayName.Contains(normalizedProcedureName)
                    || (pp.Procedure.NameL != null
                        && pp.Procedure.NameL.Contains(normalizedProcedureName))
                    || (pp.Procedure.NameR != null
                        && pp.Procedure.NameR.Contains(normalizedProcedureName))
                    || (pp.Procedure.ProcedureCode != null
                        && pp.Procedure.ProcedureCode.Contains(normalizedProcedureName))));
        }

        return await query
            .OrderByDescending(pp => pp.PriceList!.EntityBranchId == branchId)
            .ThenByDescending(pp => pp.RulePriority)
            .ThenByDescending(pp => pp.PriceList!.EffectiveFrom)
            .ThenByDescending(pp => pp.Id)
            .Select(pp => new ProcedurePriceProjection
            {
                InsuranceCompanyId = null,
                InsuranceCompanyName = null,
                PriceListId = pp.PriceListId.GetValueOrDefault(),
                PriceListName = pp.PriceList == null ? string.Empty : pp.PriceList.Name,
                PriceListType = pp.PriceList == null ? PriceListType.CashList : pp.PriceList.Type,
                ProcedureId = pp.ProcedureId,
                ProcedureName = pp.Procedure == null ? string.Empty : pp.Procedure.DisplayName,
                ProcedureCode = pp.Procedure == null ? null : pp.Procedure.ProcedureCode,
                ProcedurePricingId = pp.Id,
                Price = pp.Price,
                VatPercentage = pp.PriceList == null ? 0m : pp.PriceList.VatPercentage,
                CurrencyId = pp.PriceList == null ? 0 : pp.PriceList.CurrencyId,
                CurrencyCode = pp.PriceList == null || pp.PriceList.Currency == null ? null : pp.PriceList.Currency.Code,
                CurrencyName = pp.PriceList == null || pp.PriceList.Currency == null ? null : pp.PriceList.Currency.Name,
                CurrencySymbol = pp.PriceList == null || pp.PriceList.Currency == null ? null : pp.PriceList.Currency.Symbol,
                ExternalReferenceCode = pp.ExternalReferenceCode,
                Notes = pp.Notes
            })
            .FirstOrDefaultAsync(cancellationToken);
    }

    private async Task<ProcedurePriceProjection?> FindInsuranceProcedurePriceAsync(
        int insuranceCompanyId,
        int? branchId,
        int? procedureId,
        string? normalizedProcedureName,
        CancellationToken cancellationToken
    )
    {
        var now = DateTime.UtcNow;
        var company = await _dbContext.RisInsuranceCompanies
            .AsNoTracking()
            .Where(c =>
                c.Id == insuranceCompanyId
                && c.IsActive
                && c.PriceList != null
                && c.PriceList.Type == PriceListType.InsuranceList
                && (!branchId.HasValue
                    || c.PriceList.EntityBranchId == branchId.Value
                    || c.PriceList.EntityBranchId == null))
            .Select(c => new
            {
                c.Id,
                c.Name,
                c.PriceListId
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (company == null)
        {
            return null;
        }

        var query = _dbContext.ProcedurePricings
            .AsNoTracking()
            .Where(pp =>
                pp.PriceListId == company.PriceListId
                && (!procedureId.HasValue || pp.ProcedureId == procedureId.Value)
                && pp.IsActive
                && pp.PriceList != null
                && pp.PriceList.Status == PriceListStatus.Active
                && pp.PriceList.EffectiveFrom <= now
                && (!pp.PriceList.EffectiveTo.HasValue || pp.PriceList.EffectiveTo >= now));

        if (normalizedProcedureName != null)
        {
            query = query.Where(pp =>
                pp.Procedure != null
                && (pp.Procedure.DisplayName.Contains(normalizedProcedureName)
                    || (pp.Procedure.NameL != null
                        && pp.Procedure.NameL.Contains(normalizedProcedureName))
                    || (pp.Procedure.NameR != null
                        && pp.Procedure.NameR.Contains(normalizedProcedureName))
                    || (pp.Procedure.ProcedureCode != null
                        && pp.Procedure.ProcedureCode.Contains(normalizedProcedureName))));
        }

        return await query
            .OrderByDescending(pp => pp.RulePriority)
            .ThenByDescending(pp => pp.PriceList!.EffectiveFrom)
            .ThenByDescending(pp => pp.Id)
            .Select(pp => new ProcedurePriceProjection
            {
                InsuranceCompanyId = company.Id,
                InsuranceCompanyName = company.Name,
                PriceListId = company.PriceListId,
                PriceListName = pp.PriceList == null ? string.Empty : pp.PriceList.Name,
                PriceListType = pp.PriceList == null ? PriceListType.InsuranceList : pp.PriceList.Type,
                ProcedureId = pp.ProcedureId,
                ProcedureName = pp.Procedure == null ? string.Empty : pp.Procedure.DisplayName,
                ProcedureCode = pp.Procedure == null ? null : pp.Procedure.ProcedureCode,
                ProcedurePricingId = pp.Id,
                Price = pp.Price,
                VatPercentage = pp.PriceList == null ? 0m : pp.PriceList.VatPercentage,
                CurrencyId = pp.PriceList == null ? 0 : pp.PriceList.CurrencyId,
                CurrencyCode = pp.PriceList == null || pp.PriceList.Currency == null ? null : pp.PriceList.Currency.Code,
                CurrencyName = pp.PriceList == null || pp.PriceList.Currency == null ? null : pp.PriceList.Currency.Name,
                CurrencySymbol = pp.PriceList == null || pp.PriceList.Currency == null ? null : pp.PriceList.Currency.Symbol,
                ExternalReferenceCode = pp.ExternalReferenceCode,
                Notes = pp.Notes
            })
            .FirstOrDefaultAsync(cancellationToken);
    }

    private static RisProcedurePriceDto ToProcedurePriceDto(
        RisPayerType payerType,
        ProcedurePriceProjection pricing
    )
    {
        var vatAmount = Math.Round(pricing.Price * pricing.VatPercentage / 100m, 4);
        return new RisProcedurePriceDto(
            payerType,
            pricing.InsuranceCompanyId,
            pricing.InsuranceCompanyName,
            pricing.PriceListType,
            pricing.PriceListId,
            pricing.PriceListName,
            pricing.ProcedureId,
            pricing.ProcedureName,
            pricing.ProcedureCode,
            pricing.ProcedurePricingId,
            pricing.Price,
            pricing.VatPercentage,
            vatAmount,
            pricing.Price + vatAmount,
            pricing.CurrencyId,
            pricing.CurrencyCode,
            pricing.CurrencyName,
            pricing.CurrencySymbol,
            pricing.ExternalReferenceCode,
            pricing.Notes
        );
    }

    public async Task<RisVisitDto> BookVisitAsync(
        BookRisVisitRequest request,
        RisTextDirection? direction,
        RisBookingSource defaultBookingSource,
        CancellationToken cancellationToken
    )
    {
        var bookingSource = request.BookingSource ?? defaultBookingSource;
        var requestedOrders = request.Orders ?? Array.Empty<RisOrderInput>();

        if (requestedOrders.Count == 0 && bookingSource != RisBookingSource.Mobile)
        {
            throw new ArgumentException("At least one RIS order is required.");
        }

        var branchExists = await _dbContext.EntityBranches.AnyAsync(
            b => b.Id == request.EntityBranchId,
            cancellationToken
        );
        if (!branchExists)
        {
            throw new ArgumentException($"Branch {request.EntityBranchId} was not found.");
        }

        await using var tx = await _dbContext.Database.BeginTransactionAsync(cancellationToken);

        var visitNumber = await GenerateVisitNumberAsync(cancellationToken);
        var payer = request.Payer ?? new RisPayerInput(
            RisPayerType.SelfPay,
            "SelfPay",
            null,
            null,
            null,
            null,
            null,
            null
        );
        var schedulingPolicy = await GetSchedulingPolicyEntityAsync(request.EntityBranchId, cancellationToken);
        var bookingWarnings = new List<string>();
        var pendingReservations = new List<PendingResourceReservation>();

        var insuranceCompany = await ResolveInsuranceCompanyAsync(
            payer.InsuranceCompanyId,
            request.EntityBranchId,
            cancellationToken
        );

        var visit = new RisVisit
        {
            VisitNumber = visitNumber,
            EntityBranchId = request.EntityBranchId,
            ScheduledAtUtc = request.ScheduledAtUtc,
            BookingSource = bookingSource,
            PatientWeightKg = request.Patient.WeightKg,
            PatientHeightCm = request.Patient.HeightCm,
            ClinicalHistory = request.Patient.ClinicalHistory,
            PayerType = payer.PayerType,
            PaymentCategory = payer.PaymentCategory,
            InsurerName = payer.InsurerName ?? insuranceCompany?.Name,
            InsuranceCompanyId = insuranceCompany?.Id,
            InsuranceMemberNumber = payer.InsuranceMemberNumber,
            InsuranceApprovalNumber = payer.InsuranceApprovalNumber,
            InsuranceCoverageStatus = payer.InsuranceCoverageStatus,
            PayerNotes = payer.PayerNotes,
        };

        await ApplyVisitPatientSnapshotAsync(visit, request.Patient, direction, cancellationToken);

        _dbContext.RisVisits.Add(visit);
        await _dbContext.SaveChangesAsync(cancellationToken);

        foreach (var orderInput in requestedOrders)
        {
            var procedure = await _dbContext.Procedures
                .Include(p => p.Modality)
                .FirstOrDefaultAsync(p => p.Id == orderInput.ProcedureId, cancellationToken)
                ?? throw new ArgumentException($"Procedure {orderInput.ProcedureId} was not found.");

            var resolvedSchedule = await ResolveOrderScheduleAsync(
                request.EntityBranchId,
                request.ScheduledAtUtc,
                orderInput,
                procedure.Id,
                procedure.ModalityId,
                procedure.TimeInMinutes.GetValueOrDefault(schedulingPolicy.DefaultSlotMinutes),
                schedulingPolicy,
                pendingReservations,
                cancellationToken
            );
            bookingWarnings.AddRange(resolvedSchedule.Warnings);

            var order = new RisOrder
            {
                VisitId = visit.Id,
                ProcedureId = procedure.Id,
                RoomId = resolvedSchedule.RoomId,
                RoomResourceId = resolvedSchedule.RoomResourceId,
                OrderNumber = await GenerateOrderNumberAsync(cancellationToken),
                ScheduledStartUtc = resolvedSchedule.StartUtc,
                ScheduledEndUtc = resolvedSchedule.EndUtc,
                ScheduledStationAETitle =
                    orderInput.ScheduledStationAETitle ?? resolvedSchedule.ScheduledStationAETitle,
            };

            var rules = await _dbContext.RisProcedurePrerequisiteRules
                .Include(r => r.SubType)
                .Where(r => r.ProcedureId == procedure.Id && r.IsActive)
                .ToListAsync(cancellationToken);

            foreach (var rule in rules)
            {
                var status = ResolveInitialPrerequisiteStatus(rule, visit.PatientGender);
                order.Prerequisites.Add(new RisOrderPrerequisite
                {
                    RuleId = rule.Id,
                    Type = rule.Type,
                    SubTypeId = rule.SubTypeId,
                    SubType = rule.SubType,
                    Name = rule.Name,
                    Description = rule.Description,
                    RequiredGender = rule.RequiredGender,
                    IsRequired = rule.IsRequired,
                    Status = status,
                    CompletedAtUtc = status == RisPrerequisiteStatus.Completed
                        ? DateTime.UtcNow
                        : null,
                    CompletedBy = status == RisPrerequisiteStatus.Completed ? "RIS" : null,
                });
            }

            order.Status = order.Prerequisites.Any(p => p.IsRequired && !RisPrerequisitePolicy.IsSatisfied(p))
                ? RisOrderStatus.PrerequisitesPending
                : RisOrderStatus.ReadyForAdmission;

            visit.Orders.Add(order);

            if (resolvedSchedule.RoomResourceId.HasValue)
            {
                pendingReservations.Add(new PendingResourceReservation(
                    resolvedSchedule.RoomResourceId.Value,
                    resolvedSchedule.StartUtc,
                    resolvedSchedule.EndUtc
                ));
            }
        }

        if (requestedOrders.Count > 0)
        {
            visit.Status = visit.Orders.Any(o => o.Status == RisOrderStatus.PrerequisitesPending)
                ? RisVisitStatus.PrerequisitesPending
                : RisVisitStatus.ReadyForAdmission;
        }

        await _dbContext.SaveChangesAsync(cancellationToken);

        var correlationId = NewCorrelationId();
        await _eventPublisher.EnqueueAsync(
            RisQueues.IntegrationEvents,
            RisEventNames.VisitBooked,
            new RisVisitBookedEvent(
                visit.Id,
                visit.VisitNumber,
                visit.PatientId,
                visit.RequestedPatientIdentifier,
                visit.Orders.Select(o => o.Id).ToList()
            ),
            _tenantContext.EffectiveTenantId,
            correlationId,
            $"ris-visit-booked:{visit.Id}",
            cancellationToken
        );

        await _eventPublisher.EnqueueAsync(
            RisQueues.IntegrationEvents,
            RisEventNames.PaymentClassified,
            new RisPaymentClassifiedEvent(visit.Id, visit.PayerType.ToString(), visit.PaymentCategory, visit.InsurerName),
            _tenantContext.EffectiveTenantId,
            correlationId,
            $"ris-payment-classified:{visit.Id}",
            cancellationToken
        );

        if (bookingWarnings.Count > 0)
        {
            await _eventPublisher.EnqueueAsync(
                RisQueues.IntegrationEvents,
                RisEventNames.BookingConflictDetected,
                new RisBookingConflictDetectedEvent(
                    visit.Id,
                    visit.Orders.Select(o => o.Id).ToList(),
                    bookingWarnings
                ),
                _tenantContext.EffectiveTenantId,
                correlationId,
                $"ris-booking-conflict-detected:{visit.Id}",
                cancellationToken
            );
        }

        await _dbContext.SaveChangesAsync(cancellationToken);
        await tx.CommitAsync(cancellationToken);

        var savedVisit = await LoadVisitAsync(visit.Id, cancellationToken)
            ?? throw new InvalidOperationException("Visit was created but could not be reloaded.");
        return ToVisitDto(savedVisit, bookingWarnings);
    }

    public async Task<RisVisitDto?> UpdateVisitAsync(
        int visitId,
        UpdateRisVisitRequest request,
        RisTextDirection? direction,
        CancellationToken cancellationToken
    )
    {
        var visit = await LoadVisitAsync(visitId, cancellationToken);
        if (visit == null)
        {
            return null;
        }

        if (!CanUpdateVisit(visit.Status))
        {
            throw new InvalidOperationException(
                $"Visit {visit.VisitNumber} cannot be updated after admission, study creation, or cancellation."
            );
        }

        var targetBranchId = request.EntityBranchId ?? visit.EntityBranchId;
        var branchChanged = targetBranchId != visit.EntityBranchId;
        if (branchChanged)
        {
            if (request.Orders is null or { Count: 0 })
            {
                throw new ArgumentException("Order schedule updates are required when changing the visit branch.");
            }

            var branchExists = await _dbContext.EntityBranches.AnyAsync(
                b => b.Id == targetBranchId,
                cancellationToken
            );
            if (!branchExists)
            {
                throw new ArgumentException($"Branch {targetBranchId} was not found.");
            }
        }

        var scheduledAtUtc = NormalizeScheduledUtc(request.ScheduledAtUtc) ?? visit.ScheduledAtUtc;
        var schedulingPolicy = await GetSchedulingPolicyEntityAsync(targetBranchId, cancellationToken);
        var warnings = new List<string>();

        await using var tx = await _dbContext.Database.BeginTransactionAsync(cancellationToken);

        visit.EntityBranchId = targetBranchId;
        visit.ScheduledAtUtc = scheduledAtUtc;

        if (request.BookingSource.HasValue)
        {
            visit.BookingSource = request.BookingSource.Value;
        }

        if (request.Patient != null)
        {
            visit.PatientWeightKg = request.Patient.WeightKg;
            visit.PatientHeightCm = request.Patient.HeightCm;
            visit.ClinicalHistory = request.Patient.ClinicalHistory;
            await ApplyVisitPatientSnapshotAsync(visit, request.Patient, direction, cancellationToken);
            RefreshGenderPrerequisites(visit);
            foreach (var order in visit.Orders)
            {
                RefreshOrderStatus(order);
            }
        }

        if (request.Payer != null)
        {
            var insuranceCompany = await ResolveInsuranceCompanyAsync(
                request.Payer.InsuranceCompanyId,
                targetBranchId,
                cancellationToken
            );

            visit.PayerType = request.Payer.PayerType;
            visit.PaymentCategory = request.Payer.PaymentCategory;
            visit.InsurerName = request.Payer.InsurerName ?? insuranceCompany?.Name;
            visit.InsuranceCompanyId = insuranceCompany?.Id;
            visit.InsuranceMemberNumber = request.Payer.InsuranceMemberNumber;
            visit.InsuranceApprovalNumber = request.Payer.InsuranceApprovalNumber;
            visit.InsuranceCoverageStatus = request.Payer.InsuranceCoverageStatus;
            visit.PayerNotes = request.Payer.PayerNotes;
        }

        if (request.Orders is { Count: > 0 })
        {
            var duplicatedOrderIds = request.Orders
                .GroupBy(o => o.OrderId)
                .Where(g => g.Count() > 1)
                .Select(g => g.Key)
                .ToList();
            if (duplicatedOrderIds.Count > 0)
            {
                throw new ArgumentException(
                    $"Duplicate RIS order ids in update request: {string.Join(", ", duplicatedOrderIds)}."
                );
            }

            var updatedOrderIds = request.Orders.Select(o => o.OrderId).ToHashSet();
            if (branchChanged)
            {
                var missingOrderIds = visit.Orders
                    .Where(o => o.Status != RisOrderStatus.Cancelled)
                    .Select(o => o.Id)
                    .Where(id => !updatedOrderIds.Contains(id))
                    .ToList();
                if (missingOrderIds.Count > 0)
                {
                    throw new ArgumentException(
                        $"All active orders must be included when changing the visit branch. Missing order ids: {string.Join(", ", missingOrderIds)}."
                    );
                }
            }

            var pendingReservations = new List<PendingResourceReservation>();

            foreach (var orderRequest in request.Orders)
            {
                var order = visit.Orders.FirstOrDefault(o => o.Id == orderRequest.OrderId)
                    ?? throw new ArgumentException(
                        $"RIS order {orderRequest.OrderId} was not found in visit {visit.VisitNumber}."
                    );

                if (order.Status is RisOrderStatus.Admitted or RisOrderStatus.StudyCreated or RisOrderStatus.Cancelled)
                {
                    throw new InvalidOperationException(
                        $"RIS order {order.OrderNumber} cannot be updated after admission, study creation, or cancellation."
                    );
                }

                var procedureId = orderRequest.ProcedureId ?? order.ProcedureId;
                var procedure = await _dbContext.Procedures
                    .Include(p => p.Modality)
                    .FirstOrDefaultAsync(p => p.Id == procedureId, cancellationToken)
                    ?? throw new ArgumentException($"Procedure {procedureId} was not found.");

                var orderInput = new RisOrderInput(
                    procedure.Id,
                    orderRequest.RoomId ?? order.RoomId,
                    orderRequest.RoomResourceId ?? order.RoomResourceId,
                    orderRequest.ScheduledStartUtc ?? order.ScheduledStartUtc,
                    orderRequest.ScheduledEndUtc ?? order.ScheduledEndUtc,
                    orderRequest.ScheduledStationAETitle ?? order.ScheduledStationAETitle,
                    orderRequest.PreferredFromUtc,
                    orderRequest.PreferredToUtc
                );

                var resolvedSchedule = await ResolveOrderScheduleAsync(
                    targetBranchId,
                    scheduledAtUtc,
                    orderInput,
                    procedure.Id,
                    procedure.ModalityId,
                    procedure.TimeInMinutes.GetValueOrDefault(schedulingPolicy.DefaultSlotMinutes),
                    schedulingPolicy,
                    pendingReservations,
                    cancellationToken,
                    updatedOrderIds
                );
                warnings.AddRange(resolvedSchedule.Warnings);

                if (order.ProcedureId != procedure.Id)
                {
                    await ReplaceOrderPrerequisitesAsync(order, procedure.Id, cancellationToken);
                }

                order.ProcedureId = procedure.Id;
                order.RoomId = resolvedSchedule.RoomId;
                order.RoomResourceId = resolvedSchedule.RoomResourceId;
                order.ScheduledStartUtc = resolvedSchedule.StartUtc;
                order.ScheduledEndUtc = resolvedSchedule.EndUtc;
                order.ScheduledStationAETitle =
                    orderRequest.ScheduledStationAETitle ?? resolvedSchedule.ScheduledStationAETitle;

                RefreshOrderStatus(order);

                if (resolvedSchedule.RoomResourceId.HasValue)
                {
                    pendingReservations.Add(new PendingResourceReservation(
                        resolvedSchedule.RoomResourceId.Value,
                        resolvedSchedule.StartUtc,
                        resolvedSchedule.EndUtc
                    ));
                }
            }
        }

        RefreshVisitStatus(visit);

        await _dbContext.SaveChangesAsync(cancellationToken);
        await tx.CommitAsync(cancellationToken);

        var savedVisit = await LoadVisitAsync(visit.Id, cancellationToken)
            ?? throw new InvalidOperationException("Visit was updated but could not be reloaded.");

        return ToVisitDto(savedVisit, warnings);
    }

    public async Task<RisVisitDto?> GetVisitAsync(int visitId, CancellationToken cancellationToken)
    {
        var visit = await LoadVisitAsync(visitId, cancellationToken);
        return visit == null ? null : ToVisitDto(visit);
    }

    public async Task<RisOrderDetailsDto?> GetOrderAsync(int orderId, CancellationToken cancellationToken)
    {
        var order = await _dbContext.RisOrders
            .AsNoTracking()
            .Include(o => o.Visit)
                .ThenInclude(v => v!.Patient)
            .Include(o => o.Visit)
                .ThenInclude(v => v!.Branch)
            .Include(o => o.Procedure)
                .ThenInclude(p => p!.Modality)
            .Include(o => o.Room)
            .Include(o => o.RoomResource)
                .ThenInclude(r => r!.RemoteNode)
            .Include(o => o.Prerequisites)
                .ThenInclude(p => p.SubType)
            .FirstOrDefaultAsync(o => o.Id == orderId, cancellationToken);

        if (order?.Visit == null)
        {
            return null;
        }

        var prerequisiteIds = order.Prerequisites.Select(p => p.Id).ToList();
        var documents = await _dbContext.RisDocuments
            .AsNoTracking()
            .Where(d => d.VisitId == order.VisitId
                && (d.OrderId == order.Id
                    || (d.PrerequisiteId.HasValue
                        && prerequisiteIds.Contains(d.PrerequisiteId.Value))))
            .OrderByDescending(d => d.UploadedAtUtc)
            .Select(d => new RisDocumentDto(
                d.Id,
                d.VisitId,
                d.OrderId,
                d.PrerequisiteId,
                d.DocumentType,
                d.FileName,
                d.ContentType,
                d.SizeBytes,
                d.UploadedAtUtc
            ))
            .ToListAsync(cancellationToken);

        var visitPrerequisites = await _dbContext.RisOrderPrerequisites
            .AsNoTracking()
            .Where(p => p.Order != null && p.Order.VisitId == order.VisitId)
            .Select(p => new { p.IsRequired, p.Status })
            .ToListAsync(cancellationToken);

        var visitOrderCount = await _dbContext.RisOrders
            .AsNoTracking()
            .CountAsync(o => o.VisitId == order.VisitId, cancellationToken);

        var study = await _dbContext.Studies
            .AsNoTracking()
            .Where(s => s.RisOrderId == order.Id && !s.IsDeleted)
            .OrderByDescending(s => s.Id)
            .Select(s => new
            {
                StudyId = (int?)s.Id,
                StudyInstanceUid = s.StudyInstanceUID,
                s.AccessionNumber,
                StudyIdValue = s.StudyID,
                s.StudyDate,
                s.StudyTime,
                s.StudyDescription,
                s.StatusId,
                StudyStatus = s.Status == null ? null : s.Status.StatusDisplayName,
                s.ReportStatusId,
                ReportStatus = s.ReportStatus == null ? null : s.ReportStatus.StatusDisplayName,
                AiStatusId = s.AIStatusId,
                AiStatus = s.AIStatus == null ? null : s.AIStatus.StatusDisplayName,
                ObjectCount = s.ObjectCounts ?? s.NumberOfStudyRelatedInstances,
                SeriesCount = s.SeriesesCounts ?? s.NumberOfStudyRelatedSeries,
                ModalityId = s.ModalityId,
                ModalityName = s.Modality == null ? null : s.Modality.Name,
                s.RemoteNodeId,
                RemoteNodeAETitle = s.RemoteNodes == null ? null : s.RemoteNodes.AETitle,
                RemoteNodeCode = s.RemoteNodes == null ? null : s.RemoteNodes.NodeCode
            })
            .FirstOrDefaultAsync(cancellationToken);

        var visit = order.Visit;
        return new RisOrderDetailsDto(
            order.Id,
            order.OrderNumber,
            order.ProcedureId,
            order.Procedure == null ? study?.StudyDescription : order.Procedure.DisplayName,
            order.Procedure?.ProcedureCode,
            study?.ModalityId ?? order.Procedure?.ModalityId,
            study?.ModalityName ?? order.Procedure?.Modality?.Name,
            order.RoomId,
            order.Room?.Name,
            order.RoomResourceId,
            order.RoomResource?.DisplayName ?? order.RoomResource?.Code,
            study?.RemoteNodeId ?? order.RoomResource?.RemoteNodeId,
            study?.RemoteNodeAETitle ?? order.RoomResource?.RemoteNode?.AETitle,
            study?.RemoteNodeCode ?? order.RoomResource?.RemoteNode?.NodeCode,
            study?.StudyId ?? order.StudyId,
            study?.StudyInstanceUid,
            study?.AccessionNumber,
            study?.StudyIdValue,
            study?.StudyDate,
            study?.StudyTime,
            study?.StudyDescription,
            study?.StatusId,
            study?.StudyStatus,
            study?.ReportStatusId,
            study?.ReportStatus,
            study?.AiStatusId,
            study?.AiStatus,
            study?.ObjectCount,
            study?.SeriesCount,
            order.ScheduledStartUtc,
            order.ScheduledEndUtc,
            order.ScheduledStationAETitle,
            order.Status,
            order.Prerequisites.Select(p => new RisPrerequisiteDto(
                p.Id,
                p.RuleId,
                p.Type,
                p.SubTypeId,
                p.SubType == null ? null : p.SubType.Code,
                p.SubType == null ? null : p.SubType.Name,
                p.Name,
                p.IsRequired,
                p.Status,
                p.RequiredGender,
                p.Description
            )).ToList(),
            documents,
            visit.Id,
            visit.VisitNumber,
            visit.Status,
            visit.ScheduledAtUtc,
            visit.AdmittedAtUtc,
            visitOrderCount,
            visitPrerequisites.Count,
            visitPrerequisites.Count(p => p.Status != RisPrerequisiteStatus.Pending),
            visitPrerequisites.Count(p => p.IsRequired && p.Status == RisPrerequisiteStatus.Pending),
            visit.PayerType,
            visit.PaymentCategory,
            visit.InsurerName,
            visit.PatientId,
            GetVisitPatientDisplayName(visit),
            ToPatientSearchDto(visit),
            ToBookingPatientDto(visit),
            visit.BookingSource,
            visit.EntityBranchId,
            visit.Branch?.Name,
            Array.Empty<string>()
        );
    }

    public async Task<RisVisitDto> CancelVisitAsync(int visitId, CancellationToken cancellationToken)
    {
        var visit = await LoadVisitAsync(visitId, cancellationToken)
            ?? throw new ArgumentException($"RIS visit {visitId} was not found.");

        if (visit.Status == RisVisitStatus.Cancelled)
        {
            return ToVisitDto(visit);
        }

        if (visit.Status is RisVisitStatus.Admitted
            or RisVisitStatus.StudyCreationPending
            or RisVisitStatus.StudyCreationCompleted
            or RisVisitStatus.PartiallyAdmitted)
        {
            throw new InvalidOperationException("Only pre-admission visits can be cancelled.");
        }

        visit.Status = RisVisitStatus.Cancelled;
        foreach (var order in visit.Orders.Where(o =>
            o.Status is RisOrderStatus.Scheduled
                or RisOrderStatus.PrerequisitesPending
                or RisOrderStatus.ReadyForAdmission))
        {
            order.Status = RisOrderStatus.Cancelled;
        }

        await _dbContext.SaveChangesAsync(cancellationToken);
        return ToVisitDto(visit);
    }

    public async Task<RisOrderDetailsDto> CancelOrderAsync(int orderId, CancellationToken cancellationToken)
    {
        var order = await _dbContext.RisOrders
            .Include(o => o.Prerequisites)
            .Include(o => o.Visit)
                .ThenInclude(v => v!.Orders)
                    .ThenInclude(visitOrder => visitOrder.Prerequisites)
            .FirstOrDefaultAsync(o => o.Id == orderId, cancellationToken)
            ?? throw new ArgumentException($"RIS order {orderId} was not found.");

        if (order.Status == RisOrderStatus.Cancelled)
        {
            return await GetOrderAsync(orderId, cancellationToken)
                ?? throw new ArgumentException($"RIS order {orderId} was not found.");
        }

        if (order.Status is RisOrderStatus.Admitted or RisOrderStatus.StudyCreated)
        {
            throw new InvalidOperationException("Only pre-admission orders can be cancelled.");
        }

        if (order.Visit?.Status is RisVisitStatus.Admitted
            or RisVisitStatus.PartiallyAdmitted
            or RisVisitStatus.StudyCreationPending
            or RisVisitStatus.StudyCreationCompleted)
        {
            throw new InvalidOperationException("Only pre-admission orders can be cancelled.");
        }

        order.Status = RisOrderStatus.Cancelled;
        if (order.Visit != null)
        {
            ApplyVisitAggregateStatus(order.Visit);
        }

        await _dbContext.SaveChangesAsync(cancellationToken);
        return await GetOrderAsync(orderId, cancellationToken)
            ?? throw new ArgumentException($"RIS order {orderId} was not found.");
    }

    public async Task<IReadOnlyList<RisVisitListItemDto>> SearchVisitsAsync(
        int? branchId,
        RisVisitStatus? status,
        RisBookingSource? bookingSource,
        bool withoutOrdersOnly,
        DateTime? fromUtc,
        DateTime? toUtc,
        string? patientQuery,
        CancellationToken cancellationToken
    )
    {
        var visits = _dbContext.RisVisits
            .Include(v => v.Patient)
            .Include(v => v.Orders)
            .AsNoTracking()
            .AsQueryable();

        if (branchId.HasValue)
        {
            visits = visits.Where(v => v.EntityBranchId == branchId.Value);
        }

        if (status.HasValue)
        {
            visits = visits.Where(v => v.Status == status.Value);
        }

        if (bookingSource.HasValue)
        {
            visits = visits.Where(v => v.BookingSource == bookingSource.Value);
        }

        if (withoutOrdersOnly)
        {
            visits = visits.Where(v => !v.Orders.Any());
        }

        if (fromUtc.HasValue)
        {
            visits = visits.Where(v => v.ScheduledAtUtc >= fromUtc.Value);
        }

        if (toUtc.HasValue)
        {
            visits = visits.Where(v => v.ScheduledAtUtc <= toUtc.Value);
        }

        if (!string.IsNullOrWhiteSpace(patientQuery))
        {
            var value = patientQuery.Trim();
            visits = visits.Where(v =>
                (v.PatientId != null && v.PatientId.Contains(value))
                || (v.RequestedPatientIdentifier != null && v.RequestedPatientIdentifier.Contains(value))
                || (v.PatientFullName != null && v.PatientFullName.Contains(value))
                || (v.PatientName != null && v.PatientName.Contains(value))
                || (v.LocalPatientFullName != null && v.LocalPatientFullName.Contains(value))
                || (v.PatientPhoneNumber != null && v.PatientPhoneNumber.Contains(value))
                || (v.PatientSsn != null && v.PatientSsn.Contains(value))
                || (v.Patient != null
                    && ((v.Patient.FullName != null && v.Patient.FullName.Contains(value))
                        || (v.Patient.PatientName != null && v.Patient.PatientName.Contains(value))
                        || (v.Patient.PatientID != null && v.Patient.PatientID.Contains(value))
                        || (v.Patient.PhoneNumber != null && v.Patient.PhoneNumber.Contains(value)))));
        }

        return await visits
            .OrderByDescending(v => v.ScheduledAtUtc)
            .Take(100)
            .Select(v => new RisVisitListItemDto(
                v.Id,
                v.VisitNumber,
                v.PatientId,
                v.Patient == null
                    ? v.PatientFullName ?? v.PatientName ?? v.LocalPatientFullName ?? v.RequestedPatientIdentifier
                    : v.Patient.FullName ?? v.Patient.PatientName ?? v.Patient.PatientID,
                v.RequestedPatientIdentifier,
                v.BookingSource,
                v.EntityBranchId,
                v.ScheduledAtUtc,
                v.AdmittedAtUtc,
                v.Status,
                v.PayerType,
                v.PaymentCategory,
                v.Orders.Count
            ))
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<RisOrderListItemDto>> SearchOrdersAsync(
        int? branchId,
        RisOrderStatus? status,
        DateTime? fromUtc,
        DateTime? toUtc,
        int? modalityId,
        CancellationToken cancellationToken
    )
    {
        var orders = _dbContext.RisOrders
            .Include(o => o.Visit)
                .ThenInclude(v => v!.Patient)
            .Include(o => o.Procedure)
            .Include(o => o.Room)
            .Include(o => o.RoomResource)
            .AsNoTracking()
            .AsQueryable();

        if (branchId.HasValue)
        {
            orders = orders.Where(o => o.Visit != null && o.Visit.EntityBranchId == branchId.Value);
        }

        if (status.HasValue)
        {
            orders = orders.Where(o => o.Status == status.Value);
        }

        if (fromUtc.HasValue)
        {
            orders = orders.Where(o => o.ScheduledStartUtc >= fromUtc.Value);
        }

        if (toUtc.HasValue)
        {
            orders = orders.Where(o => o.ScheduledStartUtc <= toUtc.Value);
        }

        if (modalityId.HasValue)
        {
            orders = orders.Where(o => o.Procedure != null && o.Procedure.ModalityId == modalityId.Value);
        }

        return await orders
            .OrderByDescending(o => o.ScheduledStartUtc)
            .Take(150)
            .Select(o => new RisOrderListItemDto(
                o.Id,
                o.OrderNumber,
                o.VisitId,
                o.Visit == null ? string.Empty : o.Visit.VisitNumber,
                o.Visit == null ? null : o.Visit.PatientId,
                o.Visit == null || o.Visit.Patient == null
                    ? o.Visit == null
                        ? null
                        : o.Visit.PatientFullName
                            ?? o.Visit.PatientName
                            ?? o.Visit.LocalPatientFullName
                            ?? o.Visit.RequestedPatientIdentifier
                    : o.Visit.Patient.FullName ?? o.Visit.Patient.PatientName ?? o.Visit.Patient.PatientID,
                o.Visit == null ? null : o.Visit.RequestedPatientIdentifier,
                o.Visit == null ? RisBookingSource.Reception : o.Visit.BookingSource,
                o.ProcedureId,
                o.Procedure == null ? null : o.Procedure.DisplayName,
                o.Procedure == null ? null : o.Procedure.DisplayName,
                o.Procedure == null ? null : o.Procedure.ModalityId,
                o.RoomId,
                o.Room == null ? null : o.Room.Name,
                o.RoomResourceId,
                o.RoomResource == null ? null : o.RoomResource.DisplayName,
                o.StudyId,
                o.ScheduledStartUtc,
                o.ScheduledEndUtc,
                o.Status
            ))
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<RisStudyWorklistItemDto>> SearchStudyWorklistAsync(
        int? branchId,
        RisOrderStatus? orderStatus,
        DateTime? fromUtc,
        DateTime? toUtc,
        int? modalityId,
        string? patientQuery,
        string? accessionNumber,
        CancellationToken cancellationToken
    )
    {
        var orders = _dbContext.RisOrders
            .AsNoTracking()
            .AsQueryable();

        if (!orderStatus.HasValue)
        {
            orders = orders.Where(o => o.Status != RisOrderStatus.Cancelled);
        }

        if (branchId.HasValue)
        {
            orders = orders.Where(o =>
                o.Visit != null
                && o.Visit.EntityBranchId == branchId.Value);
        }

        if (orderStatus.HasValue)
        {
            orders = orders.Where(o => o.Status == orderStatus.Value);
        }

        if (fromUtc.HasValue)
        {
            orders = orders.Where(o => o.ScheduledStartUtc >= fromUtc.Value);
        }

        if (toUtc.HasValue)
        {
            orders = orders.Where(o => o.ScheduledStartUtc <= toUtc.Value);
        }

        if (modalityId.HasValue)
        {
            orders = orders.Where(o =>
                o.Procedure != null
                && o.Procedure.ModalityId == modalityId.Value);
        }

        if (!string.IsNullOrWhiteSpace(accessionNumber))
        {
            var value = accessionNumber.Trim();
            orders = orders.Where(o =>
                o.OrderNumber.Contains(value)
                || _dbContext.Studies.Any(s =>
                    s.RisOrderId == o.Id
                    && !s.IsDeleted
                    && s.AccessionNumber != null
                    && s.AccessionNumber.Contains(value)));
        }

        if (!string.IsNullOrWhiteSpace(patientQuery))
        {
            var value = patientQuery.Trim();
            orders = orders.Where(o =>
                o.OrderNumber.Contains(value)
                || _dbContext.Studies.Any(s =>
                    s.RisOrderId == o.Id
                    && !s.IsDeleted
                    && ((s.AccessionNumber != null && s.AccessionNumber.Contains(value))
                        || (s.StudyID != null && s.StudyID.Contains(value))))
                || (o.Visit != null
                && ((o.Visit.PatientId != null && o.Visit.PatientId.Contains(value))
                    || (o.Visit.RequestedPatientIdentifier != null
                        && o.Visit.RequestedPatientIdentifier.Contains(value))
                    || (o.Visit.PatientFullName != null
                        && o.Visit.PatientFullName.Contains(value))
                    || (o.Visit.PatientName != null
                        && o.Visit.PatientName.Contains(value))
                    || (o.Visit.LocalPatientFullName != null
                        && o.Visit.LocalPatientFullName.Contains(value))
                    || (o.Visit.PatientPhoneNumber != null
                        && o.Visit.PatientPhoneNumber.Contains(value))
                    || (o.Visit.PatientSsn != null
                        && o.Visit.PatientSsn.Contains(value))
                    || (o.Visit.Patient != null
                        && ((o.Visit.Patient.FullName != null
                                && o.Visit.Patient.FullName.Contains(value))
                            || (o.Visit.Patient.PatientName != null
                                && o.Visit.Patient.PatientName.Contains(value))
                            || (o.Visit.Patient.PatientID != null
                                && o.Visit.Patient.PatientID.Contains(value))
                            || (o.Visit.Patient.PhoneNumber != null
                                && o.Visit.Patient.PhoneNumber.Contains(value)))))));
        }

        return await orders
            .Select(o => new
            {
                Order = o,
                Study = _dbContext.Studies
                    .Where(s => s.RisOrderId == o.Id && !s.IsDeleted)
                    .OrderByDescending(s => s.Id)
                    .FirstOrDefault()
            })
            .OrderByDescending(x => x.Order.ScheduledStartUtc)
            .ThenByDescending(x => x.Study == null ? x.Order.CreatedAt : x.Study.CreatedAt)
            .Take(200)
            .Select(x => new RisStudyWorklistItemDto(
                x.Study == null ? null : x.Study.Id,
                x.Study == null ? null : x.Study.StudyInstanceUID,
                x.Study == null ? null : x.Study.AccessionNumber,
                x.Study == null ? null : x.Study.StudyID,
                x.Study == null ? null : x.Study.StudyDate,
                x.Study == null ? null : x.Study.StudyTime,
                x.Study == null ? null : x.Study.StudyDescription,
                x.Study == null ? null : x.Study.ModalitiesInStudy,
                x.Study == null ? null : x.Study.StatusId,
                x.Study == null || x.Study.Status == null ? null : x.Study.Status.StatusDisplayName,
                x.Study == null ? null : x.Study.ReportStatusId,
                x.Study == null || x.Study.ReportStatus == null ? null : x.Study.ReportStatus.StatusDisplayName,
                x.Study == null ? null : x.Study.AIStatusId,
                x.Study == null || x.Study.AIStatus == null ? null : x.Study.AIStatus.StatusDisplayName,
                x.Study == null ? null : x.Study.ObjectCounts ?? x.Study.NumberOfStudyRelatedInstances,
                x.Study == null ? null : x.Study.SeriesesCounts ?? x.Study.NumberOfStudyRelatedSeries,
                x.Order.Id,
                x.Order.OrderNumber,
                x.Order.Status,
                x.Order.ScheduledStartUtc,
                x.Order.ScheduledEndUtc,
                x.Order.ScheduledStationAETitle,
                x.Order.VisitId,
                x.Order.Visit == null
                    ? string.Empty
                    : x.Order.Visit.VisitNumber,
                x.Order.Visit == null
                    ? RisVisitStatus.Booked
                    : x.Order.Visit.Status,
                x.Order.Visit == null
                    ? x.Order.CreatedAt
                    : x.Order.Visit.ScheduledAtUtc,
                x.Order.Visit == null
                    ? null
                    : x.Order.Visit.AdmittedAtUtc,
                x.Order.Visit == null
                    ? RisPayerType.SelfPay
                    : x.Order.Visit.PayerType,
                x.Order.Visit == null
                    ? null
                    : x.Order.Visit.PaymentCategory,
                x.Order.Visit == null
                    ? null
                    : x.Order.Visit.InsurerName,
                x.Order.Visit == null
                    ? null
                    : x.Order.Visit.PatientId,
                x.Order.Visit == null || x.Order.Visit.Patient == null
                    ? x.Order.Visit == null
                        ? null
                        : x.Order.Visit.PatientFullName
                            ?? x.Order.Visit.PatientName
                            ?? x.Order.Visit.LocalPatientFullName
                            ?? x.Order.Visit.RequestedPatientIdentifier
                    : x.Order.Visit.Patient.FullName
                        ?? x.Order.Visit.Patient.PatientName
                        ?? x.Order.Visit.Patient.PatientID,
                x.Order.Visit == null
                    ? null
                    : x.Order.Visit.RequestedPatientIdentifier,
                x.Order.Visit == null
                    ? RisBookingSource.Reception
                    : x.Order.Visit.BookingSource,
                x.Order.Visit == null || x.Order.Visit.Patient == null
                    ? x.Order.Visit == null
                        ? null
                        : x.Order.Visit.PatientPhoneNumber
                    : x.Order.Visit.Patient.PhoneNumber,
                x.Order.Visit == null || x.Order.Visit.Patient == null
                    ? x.Order.Visit == null
                        ? null
                        : x.Order.Visit.PatientGender
                    : x.Order.Visit.Patient.Gender,
                x.Order.Visit == null || x.Order.Visit.Patient == null
                    ? x.Order.Visit == null
                        ? null
                        : x.Order.Visit.PatientDateOfBirth
                    : x.Order.Visit.Patient.DateOfBirth,
                x.Order.Visit == null
                    ? x.Study == null ? 0 : x.Study.EffectiveBranchId ?? 0
                    : x.Order.Visit.EntityBranchId,
                x.Order.Visit == null || x.Order.Visit.Branch == null
                    ? null
                    : x.Order.Visit.Branch.Name,
                x.Order.ProcedureId,
                x.Order.Procedure == null
                    ? x.Study == null ? null : x.Study.StudyDescription
                    : x.Order.Procedure.DisplayName,
                x.Order.Procedure == null
                    ? x.Study == null ? null : x.Study.ScheduledProcedureStepCode
                    : x.Order.Procedure.ProcedureCode,
                x.Study == null
                    ? x.Order.Procedure == null ? null : x.Order.Procedure.ModalityId
                    : x.Study.ModalityId ?? (x.Order.Procedure == null
                    ? null
                    : x.Order.Procedure.ModalityId),
                x.Study == null || x.Study.Modality == null
                    ? (x.Order.Procedure == null
                        || x.Order.Procedure.Modality == null
                            ? null
                            : x.Order.Procedure.Modality.Name)
                    : x.Study.Modality.Name,
                x.Order.RoomId,
                x.Order.Room == null ? null : x.Order.Room.Name,
                x.Order.RoomResourceId,
                x.Order.RoomResource == null
                    ? null
                    : x.Order.RoomResource.DisplayName,
                x.Study == null ? x.Order.RoomResource == null ? null : x.Order.RoomResource.RemoteNodeId : x.Study.RemoteNodeId,
                x.Study == null || x.Study.RemoteNodes == null
                    ? x.Order.RoomResource == null || x.Order.RoomResource.RemoteNode == null
                        ? null
                        : x.Order.RoomResource.RemoteNode.AETitle
                    : x.Study.RemoteNodes.AETitle,
                x.Study == null || x.Study.RemoteNodes == null
                    ? x.Order.RoomResource == null || x.Order.RoomResource.RemoteNode == null
                        ? null
                        : x.Order.RoomResource.RemoteNode.NodeCode
                    : x.Study.RemoteNodes.NodeCode,
                x.Study == null ? x.Order.CreatedAt : x.Study.CreatedAt,
                x.Study == null ? null : x.Study.CompletedAt
            ))
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<RisPendingPrerequisiteListItemDto>> GetPendingPrerequisitesAsync(
        int? entityBranchId,
        DateTime? fromUtc,
        DateTime? toUtc,
        int take,
        CancellationToken cancellationToken
    )
    {
        var limit = Math.Clamp(take, 1, 100);
        var prerequisites = _dbContext.RisOrderPrerequisites
            .AsNoTracking()
            .Where(p =>
                p.Status == RisPrerequisiteStatus.Pending
                && p.Order != null
                && p.Order.Visit != null)
            .AsQueryable();

        if (entityBranchId.HasValue)
        {
            prerequisites = prerequisites.Where(p => p.Order!.Visit!.EntityBranchId == entityBranchId.Value);
        }

        if (fromUtc.HasValue)
        {
            prerequisites = prerequisites.Where(p => p.Order!.ScheduledStartUtc >= fromUtc.Value);
        }

        if (toUtc.HasValue)
        {
            prerequisites = prerequisites.Where(p => p.Order!.ScheduledStartUtc <= toUtc.Value);
        }

        return await prerequisites
            .OrderBy(p => p.Order!.ScheduledStartUtc)
            .ThenBy(p => p.Order!.OrderNumber)
            .ThenBy(p => p.Name)
            .Take(limit)
            .Select(p => new RisPendingPrerequisiteListItemDto(
                p.Id,
                p.OrderId,
                p.Order!.OrderNumber,
                p.Order.VisitId,
                p.Order.Visit!.VisitNumber,
                p.Order.Visit!.Patient == null
                    ? string.Empty
                    : (p.Order.Visit!.Patient.PatientID ?? string.Empty),
                p.Order.Visit!.Patient == null
                    ? null
                    : p.Order.Visit!.Patient.FullName
                        ?? p.Order.Visit!.Patient.PatientName
                        ?? p.Order.Visit!.Patient.PatientID,
                p.Order.ProcedureId,
                p.Order.Procedure == null ? null : p.Order.Procedure.DisplayName,
                p.Type,
                p.SubType == null ? null : p.SubType.Code,
                p.SubType == null ? null : p.SubType.Name,
                p.Name,
                p.IsRequired,
                p.Status,
                p.Order.ScheduledStartUtc
            ))
            .ToListAsync(cancellationToken);
    }

    public async Task CompletePrerequisiteAsync(
        int orderId,
        int prerequisiteId,
        CompletePrerequisiteRequest request,
        CancellationToken cancellationToken
    )
    {
        var prerequisite = await LoadPrerequisiteAsync(orderId, prerequisiteId, cancellationToken);
        prerequisite.Status = RisPrerequisiteStatus.Completed;
        prerequisite.CompletedAtUtc = DateTime.UtcNow;
        prerequisite.CompletedBy = _currentUserService.UserId;
        prerequisite.CompletionNotes = request.Notes;
        await UpdateOrderReadinessAsync(prerequisite.OrderId, cancellationToken);
        await _dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task WaivePrerequisiteAsync(
        int orderId,
        int prerequisiteId,
        WaivePrerequisiteRequest request,
        CancellationToken cancellationToken
    )
    {
        if (string.IsNullOrWhiteSpace(request.Reason))
        {
            throw new ArgumentException("Waiver reason is required.");
        }

        var prerequisite = await LoadPrerequisiteAsync(orderId, prerequisiteId, cancellationToken);
        prerequisite.Status = RisPrerequisiteStatus.Waived;
        prerequisite.WaivedAtUtc = DateTime.UtcNow;
        prerequisite.WaivedBy = _currentUserService.UserId;
        prerequisite.WaiverReason = request.Reason;
        await UpdateOrderReadinessAsync(prerequisite.OrderId, cancellationToken);
        await _dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task<int> AddDocumentAsync(
        int visitId,
        AddRisDocumentRequest request,
        CancellationToken cancellationToken
    )
    {
        if (string.IsNullOrWhiteSpace(request.DocumentType)
            || string.IsNullOrWhiteSpace(request.FileName)
            || string.IsNullOrWhiteSpace(request.StoragePath))
        {
            throw new ArgumentException("Document type, file name, and storage path are required.");
        }

        var visitExists = await _dbContext.RisVisits.AnyAsync(v => v.Id == visitId, cancellationToken);
        if (!visitExists)
        {
            throw new ArgumentException($"RIS visit {visitId} was not found.");
        }

        var document = new RisDocument
        {
            VisitId = visitId,
            OrderId = request.OrderId,
            PrerequisiteId = request.PrerequisiteId,
            DocumentType = request.DocumentType,
            FileName = request.FileName,
            ContentType = request.ContentType,
            SizeBytes = request.SizeBytes,
            StoragePath = request.StoragePath,
            UploadedAtUtc = DateTime.UtcNow,
        };

        _dbContext.RisDocuments.Add(document);

        if (request.OrderId.HasValue && request.PrerequisiteId.HasValue)
        {
            var prerequisite = await LoadPrerequisiteAsync(
                request.OrderId.Value,
                request.PrerequisiteId.Value,
                cancellationToken
            );
            prerequisite.Status = RisPrerequisiteStatus.Completed;
            prerequisite.CompletedAtUtc = DateTime.UtcNow;
            prerequisite.CompletedBy = _currentUserService.UserId;
            prerequisite.CompletionNotes = $"Document uploaded: {request.FileName}";
            await UpdateOrderReadinessAsync(prerequisite.OrderId, cancellationToken);
        }

        await _dbContext.SaveChangesAsync(cancellationToken);
        return document.Id;
    }

    public async Task<RisDocumentFileDto?> GetDocumentFileAsync(
        int visitId,
        int documentId,
        CancellationToken cancellationToken
    )
    {
        return await _dbContext.RisDocuments
            .AsNoTracking()
            .Where(d => d.Id == documentId && d.VisitId == visitId)
            .Select(d => new RisDocumentFileDto(
                d.Id,
                d.VisitId,
                d.FileName,
                d.ContentType,
                d.StoragePath
            ))
            .FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<RisAdmissionResult> AdmitVisitAsync(
        int visitId,
        CancellationToken cancellationToken
    )
    {
        var visit = await LoadVisitAsync(visitId, cancellationToken)
            ?? throw new ArgumentException($"RIS visit {visitId} was not found.");

        var orderIds = visit.Orders
            .Where(o => o.Status is RisOrderStatus.Scheduled
                or RisOrderStatus.PrerequisitesPending
                or RisOrderStatus.ReadyForAdmission)
            .Select(o => o.Id)
            .ToList();

        if (orderIds.Count == 0)
        {
            throw new InvalidOperationException(
                $"RIS visit {visitId} has no orders that can be admitted."
            );
        }

        var missing = visit.Orders
            .Where(o => orderIds.Contains(o.Id))
            .SelectMany(o => o.Prerequisites.Select(p => new { Order = o, Prerequisite = p }))
            .Where(x => x.Prerequisite.IsRequired && !RisPrerequisitePolicy.IsSatisfied(x.Prerequisite))
            .Select(x => $"{x.Order.OrderNumber}: {x.Prerequisite.Name}")
            .ToList();

        if (missing.Count > 0)
        {
            throw new InvalidOperationException(
                "Visit admission is blocked by incomplete order prerequisites: " + string.Join(", ", missing)
            );
        }

        var admittedOrderIds = new List<int>();
        RisVisitStatus latestStatus = visit.Status;

        foreach (var orderId in orderIds)
        {
            var result = await AdmitOrderAsync(orderId, cancellationToken);
            admittedOrderIds.AddRange(result.OrderIds);
            latestStatus = result.Status;
        }

        return new RisAdmissionResult(visit.Id, latestStatus, null, null, admittedOrderIds.Distinct().ToList());
    }

    public async Task<RisAdmissionResult> AdmitOrderAsync(
        int orderId,
        CancellationToken cancellationToken
    )
    {
        var order = await _dbContext.RisOrders
            .Include(o => o.Prerequisites)
            .Include(o => o.Visit)
                .ThenInclude(v => v!.Patient)
            .Include(o => o.Visit)
                .ThenInclude(v => v!.Orders)
                    .ThenInclude(o => o.Prerequisites)
            .FirstOrDefaultAsync(o => o.Id == orderId, cancellationToken)
            ?? throw new ArgumentException($"RIS order {orderId} was not found.");

        var visit = order.Visit
            ?? throw new InvalidOperationException($"RIS order {orderId} is not linked to a visit.");

        if (visit.Status == RisVisitStatus.Cancelled || order.Status == RisOrderStatus.Cancelled)
        {
            throw new InvalidOperationException($"RIS order {order.OrderNumber} cannot be admitted because it is cancelled.");
        }

        if (order.Status == RisOrderStatus.StudyCreated)
        {
            ApplyVisitAggregateStatus(visit);
            await _dbContext.SaveChangesAsync(cancellationToken);
            return new RisAdmissionResult(
                visit.Id,
                visit.Status,
                order.Id,
                order.Status,
                new[] { order.Id }
            );
        }

        if (order.Status == RisOrderStatus.Admitted)
        {
            ApplyVisitAggregateStatus(visit, RisVisitStatus.StudyCreationPending);
            await _dbContext.SaveChangesAsync(cancellationToken);
            return new RisAdmissionResult(
                visit.Id,
                visit.Status,
                order.Id,
                order.Status,
                new[] { order.Id }
            );
        }

        var missing = order.Prerequisites
            .Where(p => p.IsRequired && !RisPrerequisitePolicy.IsSatisfied(p))
            .Select(p => $"{order.OrderNumber}: {p.Name}")
            .ToList();

        if (missing.Count > 0)
        {
            throw new InvalidOperationException(
                "Order admission is blocked by incomplete prerequisites: " + string.Join(", ", missing)
            );
        }

        await using var tx = await _dbContext.Database.BeginTransactionAsync(cancellationToken);

        PatientEntity patient;
        if (!string.IsNullOrWhiteSpace(visit.PatientId))
        {
            patient = await _dbContext.Patients.FirstOrDefaultAsync(
                p => p.Id == visit.PatientId,
                cancellationToken
            ) ?? throw new InvalidOperationException($"RIS visit {visit.Id} is linked to missing patient {visit.PatientId}.");

            visit.Patient = patient;
        }
        else
        {
            patient = await ResolveOrCreatePatientForAdmissionAsync(visit, cancellationToken);
            visit.PatientId = patient.Id;
            visit.Patient = patient;
        }

        visit.AdmittedAtUtc ??= DateTime.UtcNow;
        order.Status = RisOrderStatus.Admitted;
        ApplyVisitAggregateStatus(visit, RisVisitStatus.StudyCreationPending);

        var correlationId = NewCorrelationId();
        var orderIds = new[] { order.Id };

        await _eventPublisher.EnqueueAsync(
            RisQueues.IntegrationEvents,
            RisEventNames.VisitAdmitted,
            new RisVisitAdmittedEvent(visit.Id, visit.VisitNumber, patient.Id, orderIds),
            _tenantContext.EffectiveTenantId,
            correlationId,
            $"ris-order-admitted:{order.Id}",
            cancellationToken
        );

        await _eventPublisher.EnqueueAsync(
            RisQueues.StudyCreationRequested,
            RisEventNames.StudyCreationRequested,
            new RisStudyCreationRequestedEvent(visit.Id, orderIds),
            _tenantContext.EffectiveTenantId,
            correlationId,
            $"ris-study-creation-requested:{order.Id}",
            cancellationToken
        );

        await _dbContext.SaveChangesAsync(cancellationToken);
        await tx.CommitAsync(cancellationToken);

        return new RisAdmissionResult(visit.Id, visit.Status, order.Id, order.Status, orderIds);
    }

    public async Task<RisDashboardCountsDto> GetDashboardCountsAsync(
        RisDashboardCountsRequest request,
        CancellationToken cancellationToken
    )
    {
        var visits = _dbContext.RisVisits.AsNoTracking().AsQueryable();
        var orders = _dbContext.RisOrders.AsNoTracking().AsQueryable();

        if (request.EntityBranchId.HasValue)
        {
            visits = visits.Where(v => v.EntityBranchId == request.EntityBranchId.Value);
            orders = orders.Where(o => o.Visit != null && o.Visit.EntityBranchId == request.EntityBranchId.Value);
        }

        if (request.FromUtc.HasValue)
        {
            visits = visits.Where(v => v.ScheduledAtUtc >= request.FromUtc.Value);
            orders = orders.Where(o => o.ScheduledStartUtc >= request.FromUtc.Value);
        }

        if (request.ToUtc.HasValue)
        {
            visits = visits.Where(v => v.ScheduledAtUtc <= request.ToUtc.Value);
            orders = orders.Where(o => o.ScheduledStartUtc <= request.ToUtc.Value);
        }

        var visitsByPayer = await visits
            .GroupBy(v => v.PayerType)
            .Select(g => new { Key = g.Key.ToString(), Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count, cancellationToken);

        var visitsByPayment = await visits
            .GroupBy(v => v.PaymentCategory ?? "Unspecified")
            .Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count, cancellationToken);

        var ordersByStatus = await orders
            .GroupBy(o => o.Status)
            .Select(g => new { Key = g.Key.ToString(), Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count, cancellationToken);

        var visitsByStatus = await visits
            .GroupBy(v => v.Status)
            .Select(g => new { Key = g.Key.ToString(), Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count, cancellationToken);

        var ordersByBranch = await orders
            .Where(o => o.Visit != null)
            .GroupBy(o => o.Visit!.EntityBranchId)
            .Select(g => new { Key = g.Key.ToString(), Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count, cancellationToken);

        var ordersByModality = await orders
            .Where(o => o.Procedure != null)
            .GroupBy(o => o.Procedure!.ModalityId)
            .Select(g => new { Key = g.Key.ToString(), Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count, cancellationToken);

        var ordersByRoom = await orders
            .GroupBy(o => o.RoomId.HasValue ? o.RoomId.Value.ToString() : "Unassigned")
            .Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count, cancellationToken);

        var ordersByRoomResource = await orders
            .GroupBy(o => o.RoomResourceId.HasValue ? o.RoomResourceId.Value.ToString() : "Unassigned")
            .Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count, cancellationToken);

        var prerequisites = _dbContext.RisOrderPrerequisites.AsNoTracking().AsQueryable();
        if (request.EntityBranchId.HasValue)
        {
            prerequisites = prerequisites.Where(p =>
                p.Order != null
                && p.Order.Visit != null
                && p.Order.Visit.EntityBranchId == request.EntityBranchId.Value);
        }

        if (request.FromUtc.HasValue)
        {
            prerequisites = prerequisites.Where(p => p.Order != null && p.Order.ScheduledStartUtc >= request.FromUtc.Value);
        }

        if (request.ToUtc.HasValue)
        {
            prerequisites = prerequisites.Where(p => p.Order != null && p.Order.ScheduledStartUtc <= request.ToUtc.Value);
        }

        var prerequisitesByStatus = await prerequisites
            .GroupBy(p => p.Status)
            .Select(g => new { Key = g.Key.ToString(), Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count, cancellationToken);

        var conflictCount = 0;
        if (request.EntityBranchId.HasValue && request.FromUtc.HasValue && request.ToUtc.HasValue)
        {
            conflictCount = (await GetSchedulingConflictsAsync(
                request.EntityBranchId.Value,
                request.FromUtc.Value,
                request.ToUtc.Value,
                null,
                cancellationToken
            )).Count;
        }

        return new RisDashboardCountsDto(
            await visits.CountAsync(cancellationToken),
            await orders.CountAsync(cancellationToken),
            visitsByPayer,
            visitsByPayment,
            ordersByStatus,
            visitsByStatus,
            ordersByBranch,
            ordersByModality,
            ordersByRoom,
            ordersByRoomResource,
            prerequisitesByStatus,
            conflictCount
        );
    }

    private sealed record PendingResourceReservation(
        int RoomResourceId,
        DateTime StartUtc,
        DateTime EndUtc
    );

    private sealed record ResolvedOrderSchedule(
        int? RoomId,
        int? RoomResourceId,
        DateTime StartUtc,
        DateTime EndUtc,
        string? ScheduledStationAETitle,
        IReadOnlyList<string> Warnings
    );

    private async Task<ResolvedOrderSchedule> ResolveOrderScheduleAsync(
        int branchId,
        DateTime visitScheduledAtUtc,
        RisOrderInput orderInput,
        int procedureId,
        int procedureModalityId,
        int procedureMinutes,
        RisSchedulingPolicy policy,
        List<PendingResourceReservation> pendingReservations,
        CancellationToken cancellationToken,
        IReadOnlyCollection<int>? excludedOrderIds = null
    )
    {
        var requestedStart = NormalizeScheduledUtc(orderInput.ScheduledStartUtc);
        var searchFrom = NormalizeScheduledUtc(orderInput.PreferredFromUtc)
            ?? requestedStart
            ?? visitScheduledAtUtc;
        var searchTo = NormalizeScheduledUtc(orderInput.PreferredToUtc)
            ?? (requestedStart.HasValue
                ? requestedStart.Value.AddMinutes(procedureMinutes)
                : searchFrom.AddDays(7));

        if (searchTo <= searchFrom)
        {
            throw new ArgumentException("Preferred scheduling window end must be after start.");
        }

        if (orderInput.RoomId.HasValue)
        {
            var roomExists = await _dbContext.RisRooms.AnyAsync(
                r => r.Id == orderInput.RoomId.Value && r.EntityBranchId == branchId,
                cancellationToken
            );
            if (!roomExists)
            {
                throw new ArgumentException(
                    $"RIS room {orderInput.RoomId.Value} was not found in branch {branchId}."
                );
            }
        }

        RisRoomResource? requestedResource = null;
        if (orderInput.RoomResourceId.HasValue)
        {
            requestedResource = await LoadSchedulableResourceAsync(
                branchId,
                orderInput.RoomResourceId.Value,
                cancellationToken
            );
            EnsureResourceCanPerformProcedure(requestedResource, procedureModalityId);

            if (orderInput.RoomId.HasValue && requestedResource.RoomId != orderInput.RoomId.Value)
            {
                throw new ArgumentException(
                    $"RIS room resource {requestedResource.Id} does not belong to room {orderInput.RoomId.Value}."
                );
            }
        }

        if (requestedStart.HasValue)
        {
            var start = requestedStart.Value;
            var end = orderInput.ScheduledEndUtc ?? start.AddMinutes(procedureMinutes);
            if (end <= start)
            {
                throw new ArgumentException("Scheduled end must be after scheduled start.");
            }

            if (orderInput.RoomResourceId.HasValue)
            {
                var resource = requestedResource!;

                var warnings = await ValidateResourceSlotAsync(
                    resource,
                    start,
                    end,
                    policy,
                    pendingReservations,
                    cancellationToken,
                    excludedOrderIds
                );

                return new ResolvedOrderSchedule(
                    resource.RoomId,
                    resource.Id,
                    start,
                    end,
                    resource.RemoteNode?.AETitle,
                    warnings
                );
            }

            var exactResource = await FindFirstResourceForSlotAsync(
                branchId,
                procedureId,
                procedureModalityId,
                start,
                end,
                orderInput.RoomId,
                null,
                policy,
                pendingReservations,
                cancellationToken,
                excludedOrderIds
            );

            if (exactResource != null)
            {
                return new ResolvedOrderSchedule(
                    exactResource.RoomId,
                    exactResource.Id,
                    start,
                    end,
                    exactResource.RemoteNode?.AETitle,
                    Array.Empty<string>()
                );
            }

            return ResolveUnassignedScheduleFallback(
                orderInput.RoomId,
                start,
                end,
                $"No available RIS machine could be found from {start:u} to {end:u}.",
                policy
            );
        }

        var slot = await FindFirstAvailableSlotAsync(
            branchId,
            procedureId,
            procedureModalityId,
            searchFrom,
            searchTo,
            orderInput.RoomId,
            orderInput.RoomResourceId,
            procedureMinutes,
            policy,
            pendingReservations,
            cancellationToken,
            excludedOrderIds
        );

        if (slot != null)
        {
            return slot;
        }

        var fallbackEnd = searchFrom.AddMinutes(procedureMinutes);
        return ResolveUnassignedScheduleFallback(
            orderInput.RoomId,
            searchFrom,
            fallbackEnd,
            $"No available RIS machine slot could be found from {searchFrom:u} to {searchTo:u}.",
            policy
        );
    }

    private async Task<ResolvedOrderSchedule?> FindFirstAvailableSlotAsync(
        int branchId,
        int procedureId,
        int procedureModalityId,
        DateTime fromUtc,
        DateTime toUtc,
        int? roomId,
        int? roomResourceId,
        int procedureMinutes,
        RisSchedulingPolicy policy,
        List<PendingResourceReservation> pendingReservations,
        CancellationToken cancellationToken,
        IReadOnlyCollection<int>? excludedOrderIds = null
    )
    {
        var shifts = await GetCandidateShiftsAsync(
            branchId,
            procedureModalityId,
            fromUtc,
            toUtc,
            roomId,
            roomResourceId,
            cancellationToken
        );

        foreach (var shift in shifts)
        {
            foreach (var (start, end) in GenerateSlotsForShift(shift, fromUtc, toUtc, procedureMinutes))
            {
                var resource = shift.RoomResource!;
                var bookedCount = await CountOverlappingOrdersAsync(
                    resource.Id,
                    start,
                    end,
                    policy.DefaultSlotMinutes,
                    cancellationToken,
                    excludedOrderIds
                );
                bookedCount += CountOverlappingPendingReservations(
                    pendingReservations,
                    resource.Id,
                    start,
                    end
                );

                var capacity = ResolveShiftCapacity(shift, resource, policy);
                if (bookedCount < capacity || policy.AllowOverbooking)
                {
                    var warnings = bookedCount >= capacity
                        ? new[]
                        {
                            $"Room resource {resource.Id} is overbooked from {start:u} to {end:u} ({bookedCount}/{capacity})."
                        }
                        : Array.Empty<string>();

                    return new ResolvedOrderSchedule(
                        resource.RoomId,
                        resource.Id,
                        start,
                        end,
                        resource.RemoteNode?.AETitle,
                        warnings
                    );
                }
            }
        }

        return null;
    }

    private async Task<RisRoomResource?> FindFirstResourceForSlotAsync(
        int branchId,
        int procedureId,
        int procedureModalityId,
        DateTime startUtc,
        DateTime endUtc,
        int? roomId,
        int? roomResourceId,
        RisSchedulingPolicy policy,
        List<PendingResourceReservation> pendingReservations,
        CancellationToken cancellationToken,
        IReadOnlyCollection<int>? excludedOrderIds = null
    )
    {
        var shifts = await GetCandidateShiftsAsync(
            branchId,
            procedureModalityId,
            startUtc,
            endUtc,
            roomId,
            roomResourceId,
            cancellationToken
        );

        foreach (var shift in shifts.Where(s => CoversSlot(s, startUtc, endUtc)))
        {
            var resource = shift.RoomResource!;
            var bookedCount = await CountOverlappingOrdersAsync(
                resource.Id,
                startUtc,
                endUtc,
                policy.DefaultSlotMinutes,
                cancellationToken,
                excludedOrderIds
            );
            bookedCount += CountOverlappingPendingReservations(
                pendingReservations,
                resource.Id,
                startUtc,
                endUtc
            );

            var capacity = ResolveShiftCapacity(shift, resource, policy);
            if (bookedCount < capacity || policy.AllowOverbooking)
            {
                return resource;
            }
        }

        return null;
    }

    private async Task<IReadOnlyList<string>> ValidateResourceSlotAsync(
        RisRoomResource resource,
        DateTime start,
        DateTime end,
        RisSchedulingPolicy policy,
        List<PendingResourceReservation> pendingReservations,
        CancellationToken cancellationToken,
        IReadOnlyCollection<int>? excludedOrderIds = null
    )
    {
        var shift = await FindCoveringShiftAsync(resource.Id, start, end, cancellationToken);
        if (shift == null)
        {
            var message = $"No active shift covers room resource {resource.Id} from {start:u} to {end:u}.";
            if (policy.EnforceAvailability)
            {
                throw new InvalidOperationException(message);
            }

            return new[] { message };
        }

        var capacity = ResolveShiftCapacity(shift, resource, policy);
        var bookedCount = await CountOverlappingOrdersAsync(
            resource.Id,
            start,
            end,
            policy.DefaultSlotMinutes,
            cancellationToken,
            excludedOrderIds
        );
        bookedCount += CountOverlappingPendingReservations(
            pendingReservations,
            resource.Id,
            start,
            end
        );

        if (bookedCount >= capacity && !policy.AllowOverbooking)
        {
            var message = $"Room resource {resource.Id} is fully booked from {start:u} to {end:u} ({bookedCount}/{capacity}).";
            if (policy.EnforceAvailability)
            {
                throw new InvalidOperationException(message);
            }

            return new[] { message };
        }

        return Array.Empty<string>();
    }

    private static ResolvedOrderSchedule ResolveUnassignedScheduleFallback(
        int? roomId,
        DateTime startUtc,
        DateTime endUtc,
        string message,
        RisSchedulingPolicy policy
    )
    {
        if (policy.EnforceAvailability)
        {
            throw new InvalidOperationException(message);
        }

        return new ResolvedOrderSchedule(
            roomId,
            null,
            startUtc,
            endUtc,
            null,
            new[] { message }
        );
    }

    private async Task<RisSchedulingPolicy> GetSchedulingPolicyEntityAsync(
        int branchId,
        CancellationToken cancellationToken
    )
    {
        return await _dbContext.RisSchedulingPolicies.AsNoTracking().FirstOrDefaultAsync(
            p => p.EntityBranchId == branchId,
            cancellationToken
        ) ?? DefaultSchedulingPolicy(branchId);
    }

    private static RisSchedulingPolicy DefaultSchedulingPolicy(int branchId) =>
        new()
        {
            EntityBranchId = branchId,
            EnforceAvailability = false,
            AllowOverbooking = false,
            DefaultSlotMinutes = 30,
            DefaultCapacityPerResource = 1,
        };

    private async Task<RisRoomResource> BuildRoomResourceAsync(
        int branchId,
        int? remoteNodeId,
        int? modalityId,
        string code,
        string? displayName,
        string? resourceType,
        string? manufacturer,
        string? modelName,
        string? serialNumber,
        string? notes,
        bool? schedulingEnabled,
        int? defaultSlotMinutes,
        int? capacity,
        RisRoomResourceOperationalStatus? operationalStatus,
        bool isActive,
        CancellationToken cancellationToken
    )
    {
        if (string.IsNullOrWhiteSpace(code))
        {
            throw new ArgumentException("Room resource code is required.");
        }

        if (defaultSlotMinutes.HasValue && defaultSlotMinutes.Value <= 0)
        {
            throw new ArgumentException("Room resource default slot minutes must be greater than zero.");
        }

        if (capacity.HasValue && capacity.Value <= 0)
        {
            throw new ArgumentException("Room resource capacity must be greater than zero.");
        }

        RDBServiceModels.Models.Entity.RemoteNodes? remoteNode = null;
        if (remoteNodeId.HasValue)
        {
            remoteNode = await _dbContext.RemoteNodes
                .AsNoTracking()
                .FirstOrDefaultAsync(n => n.Id == remoteNodeId.Value, cancellationToken)
                ?? throw new ArgumentException($"Remote node {remoteNodeId.Value} was not found.");

            if (remoteNode.EntityBranchId != branchId)
            {
                throw new ArgumentException(
                    $"Remote node {remoteNodeId.Value} belongs to branch {remoteNode.EntityBranchId}, not RIS room branch {branchId}."
                );
            }

            if (modalityId.HasValue && modalityId.Value != remoteNode.ModalityId)
            {
                throw new ArgumentException(
                    $"Remote node {remoteNodeId.Value} modality {remoteNode.ModalityId} does not match resource modality {modalityId.Value}."
                );
            }

            modalityId ??= remoteNode.ModalityId;
        }

        if (modalityId.HasValue)
        {
            var modalityExists = await _dbContext.Modality.AnyAsync(
                m => m.Id == modalityId.Value,
                cancellationToken
            );
            if (!modalityExists)
            {
                throw new ArgumentException($"Modality {modalityId.Value} was not found.");
            }
        }

        return new RisRoomResource
        {
            RemoteNodeId = remoteNodeId,
            ModalityId = modalityId,
            Code = code.Trim(),
            DisplayName = NormalizeOptionalText(displayName) ?? remoteNode?.AETitle ?? code.Trim(),
            ResourceType = NormalizeOptionalText(resourceType) ?? "Machine",
            Manufacturer = NormalizeOptionalText(manufacturer),
            ModelName = NormalizeOptionalText(modelName),
            SerialNumber = NormalizeOptionalText(serialNumber),
            Notes = NormalizeOptionalText(notes),
            SchedulingEnabled = schedulingEnabled ?? true,
            DefaultSlotMinutes = defaultSlotMinutes,
            Capacity = capacity,
            OperationalStatus = operationalStatus ?? RisRoomResourceOperationalStatus.Operating,
            IsActive = isActive,
        };
    }

    private async Task<RisRoomResourceShift?> FindCoveringShiftAsync(
        int roomResourceId,
        DateTime startUtc,
        DateTime endUtc,
        CancellationToken cancellationToken
    )
    {
        var startTime = TimeOnly.FromDateTime(startUtc);
        var endTime = TimeOnly.FromDateTime(endUtc);

        return await _dbContext.RisRoomResourceShifts
            .Include(s => s.RoomResource)
            .Where(s =>
                s.RoomResourceId == roomResourceId
                && s.IsActive
                && s.RoomResource != null
                && s.RoomResource.IsActive
                && s.RoomResource.SchedulingEnabled
                && (s.RoomResource.OperationalStatus == RisRoomResourceOperationalStatus.Operating
                    || s.RoomResource.OperationalStatus == RisRoomResourceOperationalStatus.Idle)
                && s.DayOfWeek == startUtc.DayOfWeek
                && s.StartTime <= startTime
                && s.EndTime >= endTime
                && (!s.EffectiveFromUtc.HasValue || s.EffectiveFromUtc.Value <= startUtc)
                && (!s.EffectiveToUtc.HasValue || s.EffectiveToUtc.Value >= endUtc))
            .OrderByDescending(s => s.Capacity)
            .FirstOrDefaultAsync(cancellationToken);
    }

    private async Task<RisRoomResource> LoadSchedulableResourceAsync(
        int branchId,
        int roomResourceId,
        CancellationToken cancellationToken
    )
    {
        return await _dbContext.RisRoomResources
            .Include(r => r.Room)
            .Include(r => r.RemoteNode)
            .FirstOrDefaultAsync(
                r =>
                    r.Id == roomResourceId
                    && r.Room != null
                    && r.Room.EntityBranchId == branchId
                    && r.Room.Status == RisRoomStatus.Active
                    && r.IsActive
                    && r.SchedulingEnabled
                    && (r.OperationalStatus == RisRoomResourceOperationalStatus.Operating
                        || r.OperationalStatus == RisRoomResourceOperationalStatus.Idle),
                cancellationToken
            )
            ?? throw new ArgumentException(
                $"Active schedulable RIS room resource {roomResourceId} was not found in branch {branchId}."
            );
    }

    private async Task<List<RisRoomResourceShift>> GetCandidateShiftsAsync(
        int branchId,
        int procedureModalityId,
        DateTime fromUtc,
        DateTime toUtc,
        int? roomId,
        int? roomResourceId,
        CancellationToken cancellationToken
    )
    {
        return await _dbContext.RisRoomResourceShifts
            .Include(s => s.RoomResource)
                .ThenInclude(r => r!.Room)
            .Include(s => s.RoomResource)
                .ThenInclude(r => r!.RemoteNode)
            .Where(s =>
                s.IsActive
                && s.RoomResource != null
                && s.RoomResource.IsActive
                && s.RoomResource.SchedulingEnabled
                && (s.RoomResource.OperationalStatus == RisRoomResourceOperationalStatus.Operating
                    || s.RoomResource.OperationalStatus == RisRoomResourceOperationalStatus.Idle)
                && s.RoomResource.Room != null
                && s.RoomResource.Room.EntityBranchId == branchId
                && s.RoomResource.Room.Status == RisRoomStatus.Active
                && (!roomId.HasValue || s.RoomResource.RoomId == roomId.Value)
                && (!roomResourceId.HasValue || s.RoomResourceId == roomResourceId.Value)
                && (
                    s.RoomResource.ModalityId == null
                    || s.RoomResource.ModalityId == procedureModalityId
                    || (s.RoomResource.RemoteNode != null
                        && s.RoomResource.RemoteNode.ModalityId == procedureModalityId)
                )
                && (!s.EffectiveFromUtc.HasValue || s.EffectiveFromUtc.Value <= toUtc)
                && (!s.EffectiveToUtc.HasValue || s.EffectiveToUtc.Value >= fromUtc))
            .AsNoTracking()
            .OrderBy(s => s.RoomResource!.Room!.Name)
            .ThenBy(s => s.RoomResource!.DisplayName ?? s.RoomResource.Code)
            .ThenBy(s => s.DayOfWeek)
            .ThenBy(s => s.StartTime)
            .ToListAsync(cancellationToken);
    }

    private static void EnsureResourceCanPerformProcedure(
        RisRoomResource resource,
        int procedureModalityId
    )
    {
        if (resource.ModalityId.HasValue && resource.ModalityId.Value != procedureModalityId)
        {
            throw new ArgumentException(
                $"RIS room resource {resource.Id} modality {resource.ModalityId.Value} does not match procedure modality {procedureModalityId}."
            );
        }

        if (!resource.ModalityId.HasValue
            && resource.RemoteNode != null
            && resource.RemoteNode.ModalityId != procedureModalityId)
        {
            throw new ArgumentException(
                $"RIS room resource {resource.Id} remote node modality {resource.RemoteNode.ModalityId} does not match procedure modality {procedureModalityId}."
            );
        }
    }

    private static int ResolveShiftCapacity(
        RisRoomResourceShift shift,
        RisRoomResource resource,
        RisSchedulingPolicy policy
    ) =>
        shift.Capacity > 0
            ? shift.Capacity
            : resource.Capacity.GetValueOrDefault(policy.DefaultCapacityPerResource);

    private static bool CoversSlot(
        RisRoomResourceShift shift,
        DateTime startUtc,
        DateTime endUtc
    )
    {
        var startTime = TimeOnly.FromDateTime(startUtc);
        var endTime = TimeOnly.FromDateTime(endUtc);

        return shift.DayOfWeek == startUtc.DayOfWeek
            && shift.StartTime <= startTime
            && shift.EndTime >= endTime
            && (!shift.EffectiveFromUtc.HasValue || shift.EffectiveFromUtc.Value <= startUtc)
            && (!shift.EffectiveToUtc.HasValue || shift.EffectiveToUtc.Value >= endUtc);
    }

    private static int CountOverlappingPendingReservations(
        IEnumerable<PendingResourceReservation> pendingReservations,
        int roomResourceId,
        DateTime startUtc,
        DateTime endUtc
    ) =>
        pendingReservations.Count(r =>
            r.RoomResourceId == roomResourceId
            && r.StartUtc < endUtc
            && r.EndUtc > startUtc
        );

    private static DateTime? NormalizeScheduledUtc(DateTime? value)
    {
        if (!value.HasValue || value.Value <= DateTime.UnixEpoch)
        {
            return null;
        }

        return value.Value.Kind == DateTimeKind.Local
            ? value.Value.ToUniversalTime()
            : DateTime.SpecifyKind(value.Value, DateTimeKind.Utc);
    }

    private async Task<int> ResolveCapacityAsync(
        int roomResourceId,
        DateTime startUtc,
        DateTime endUtc,
        int defaultCapacity,
        CancellationToken cancellationToken
    )
    {
        var shift = await FindCoveringShiftAsync(roomResourceId, startUtc, endUtc, cancellationToken);
        return shift?.Capacity > 0 ? shift.Capacity : defaultCapacity;
    }

    private async Task<int> CountOverlappingOrdersAsync(
        int roomResourceId,
        DateTime startUtc,
        DateTime endUtc,
        int defaultSlotMinutes,
        CancellationToken cancellationToken,
        IReadOnlyCollection<int>? excludedOrderIds = null
    )
    {
        return await _dbContext.RisOrders.CountAsync(
            o =>
                o.RoomResourceId == roomResourceId
                && (excludedOrderIds == null || !excludedOrderIds.Contains(o.Id))
                && o.Status != RisOrderStatus.Cancelled
                && o.ScheduledStartUtc < endUtc
                && (o.ScheduledEndUtc ?? o.ScheduledStartUtc.AddMinutes(defaultSlotMinutes)) > startUtc,
            cancellationToken
        );
    }

    private async Task<List<RisOrder>> GetOrdersInRangeAsync(
        int branchId,
        DateTime fromUtc,
        DateTime toUtc,
        int? roomResourceId,
        CancellationToken cancellationToken
    )
    {
        return await _dbContext.RisOrders
            .Include(o => o.Visit)
            .Include(o => o.RoomResource)
                .ThenInclude(r => r!.Room)
            .Where(o =>
                o.Visit != null
                && o.Visit.EntityBranchId == branchId
                && o.Status != RisOrderStatus.Cancelled
                && o.ScheduledStartUtc < toUtc
                && (!o.ScheduledEndUtc.HasValue || o.ScheduledEndUtc.Value > fromUtc)
                && o.RoomResourceId.HasValue
                && (!roomResourceId.HasValue || o.RoomResourceId == roomResourceId.Value))
            .AsNoTracking()
            .ToListAsync(cancellationToken);
    }

    private static DateTime ResolveOrderEnd(RisOrder order, int defaultSlotMinutes) =>
        order.ScheduledEndUtc ?? order.ScheduledStartUtc.AddMinutes(defaultSlotMinutes);

    private static IEnumerable<(DateTime StartUtc, DateTime EndUtc)> GenerateSlotsForShift(
        RisRoomResourceShift shift,
        DateTime fromUtc,
        DateTime toUtc,
        int procedureMinutes
    )
    {
        var day = fromUtc.Date;
        while (day <= toUtc.Date)
        {
            if (day.DayOfWeek != shift.DayOfWeek)
            {
                day = day.AddDays(1);
                continue;
            }

            var shiftStart = day.Add(shift.StartTime.ToTimeSpan());
            var shiftEnd = day.Add(shift.EndTime.ToTimeSpan());
            var firstSlotStart = shiftStart > fromUtc ? shiftStart : fromUtc;
            var lastSlotEnd = shiftEnd < toUtc ? shiftEnd : toUtc;

            var slotStart = firstSlotStart;
            var slotStep = TimeSpan.FromMinutes(shift.SlotMinutes);
            while (slotStart.AddMinutes(procedureMinutes) <= lastSlotEnd)
            {
                var slotEnd = slotStart.AddMinutes(procedureMinutes);
                if ((!shift.EffectiveFromUtc.HasValue || shift.EffectiveFromUtc.Value <= slotStart)
                    && (!shift.EffectiveToUtc.HasValue || shift.EffectiveToUtc.Value >= slotEnd))
                {
                    yield return (slotStart, slotEnd);
                }

                slotStart = slotStart.Add(slotStep);
            }

            day = day.AddDays(1);
        }
    }

    private async Task ApplyVisitPatientSnapshotAsync(
        RisVisit visit,
        RisPatientInput input,
        RisTextDirection? direction,
        CancellationToken cancellationToken
    )
    {
        var requestedPatientIdentifier = NormalizeOptionalText(input.PatientId);
        var phoneNumber = NormalizePhoneNumber(input.PhoneNumber);

        if (requestedPatientIdentifier == null && phoneNumber == null)
        {
            throw new ArgumentException("Phone number is required when no patient identifier is supplied.");
        }

        if (phoneNumber != null && !IsValidInternationalPhoneNumber(phoneNumber))
        {
            throw new ArgumentException("Phone number must include a country code, for example +15551234567.");
        }

        visit.RequestedPatientIdentifier = requestedPatientIdentifier;
        visit.PatientFirstName = await ResolvePatientNamePartAsync(
            input.FirstName,
            input.EnglishFirstName,
            visit.PatientFirstName,
            value => visit.LocalPatientFirstName = value,
            direction,
            cancellationToken
        );
        visit.PatientMiddleName = await ResolvePatientNamePartAsync(
            input.MiddleName,
            input.EnglishMiddleName,
            visit.PatientMiddleName,
            value => visit.LocalPatientMiddleName = value,
            direction,
            cancellationToken
        );
        visit.PatientLastName = await ResolvePatientNamePartAsync(
            input.LastName,
            input.EnglishLastName,
            visit.PatientLastName,
            value => visit.LocalPatientLastName = value,
            direction,
            cancellationToken
        );

        var fullName = BuildFullName(visit.PatientFirstName, visit.PatientMiddleName, visit.PatientLastName);
        if (!string.IsNullOrWhiteSpace(fullName))
        {
            visit.PatientFullName = fullName;
            visit.PatientName = fullName;
        }

        var localFullName = BuildFullName(
            visit.LocalPatientFirstName,
            visit.LocalPatientMiddleName,
            visit.LocalPatientLastName
        );
        if (!string.IsNullOrWhiteSpace(localFullName))
        {
            visit.LocalPatientFullName = localFullName;
        }

        visit.PatientSsn = NormalizeOptionalText(input.Ssn);
        visit.PatientPhoneNumber = phoneNumber;
        visit.PatientEmail = NormalizeOptionalText(input.Email);
        visit.PatientGender = NormalizeOptionalText(input.Gender);
        visit.PatientDateOfBirth = input.DateOfBirth;
        visit.PatientAddress = NormalizeOptionalText(input.Address);
        visit.PatientEmergencyContactNumber = NormalizePhoneNumber(input.EmergencyContactNumber);
    }

    private async Task<RisInsuranceCompany?> ResolveInsuranceCompanyAsync(
        int? insuranceCompanyId,
        int branchId,
        CancellationToken cancellationToken
    )
    {
        if (!insuranceCompanyId.HasValue)
        {
            return null;
        }

        var company = await _dbContext.RisInsuranceCompanies
            .AsNoTracking()
            .Include(c => c.PriceList)
            .FirstOrDefaultAsync(c => c.Id == insuranceCompanyId.Value, cancellationToken)
            ?? throw new ArgumentException($"Insurance company {insuranceCompanyId.Value} was not found.");

        if (!company.IsActive)
        {
            throw new ArgumentException($"Insurance company {company.Name} is inactive.");
        }

        if (company.PriceList == null)
        {
            throw new ArgumentException($"Insurance company {company.Name} is not linked to a price list.");
        }

        if (company.PriceList.EntityBranchId.HasValue && company.PriceList.EntityBranchId != branchId)
        {
            throw new ArgumentException(
                $"Insurance company {company.Name} is linked to price list {company.PriceListId}, which does not belong to branch {branchId}."
            );
        }

        return company;
    }

    private async Task<PatientEntity> ResolveOrCreatePatientForAdmissionAsync(
        RisVisit visit,
        CancellationToken cancellationToken
    )
    {
        var patient = await ResolveExistingPatientForAdmissionAsync(visit, cancellationToken);
        if (patient == null)
        {
            var patientIdentifier = NormalizeOptionalText(visit.RequestedPatientIdentifier)
                ?? await GeneratePatientNumberAsync(cancellationToken);

            patient = new PatientEntity
            {
                Id = Guid.NewGuid().ToString(),
                PatientID = patientIdentifier,
                MRN = patientIdentifier,
            };
            ApplyVisitSnapshotToPatient(patient, visit, overwrite: true);
            _dbContext.Patients.Add(patient);
            return patient;
        }

        ApplyVisitSnapshotToPatient(patient, visit, overwrite: false);
        return patient;
    }

    private async Task<PatientEntity?> ResolveExistingPatientForAdmissionAsync(
        RisVisit visit,
        CancellationToken cancellationToken
    )
    {
        var requestedPatientIdentifier = NormalizeOptionalText(visit.RequestedPatientIdentifier);
        if (requestedPatientIdentifier != null)
        {
            var identifierMatches = await _dbContext.Patients
                .Where(p =>
                    p.IsActive != false
                    && (p.PatientID == requestedPatientIdentifier || p.MRN == requestedPatientIdentifier))
                .Take(2)
                .ToListAsync(cancellationToken);

            if (identifierMatches.Count > 1)
            {
                throw new InvalidOperationException(
                    $"Admission is blocked because patient identifier {requestedPatientIdentifier} matches multiple patients."
                );
            }

            if (identifierMatches.Count == 1)
            {
                return identifierMatches[0];
            }
        }

        var ssn = NormalizeOptionalText(visit.PatientSsn);
        if (ssn != null)
        {
            var ssnMatches = await _dbContext.Patients
                .Where(p => p.IsActive != false && p.SSN == ssn)
                .Take(2)
                .ToListAsync(cancellationToken);

            if (ssnMatches.Count > 1)
            {
                throw new InvalidOperationException(
                    $"Admission is blocked because SSN {ssn} matches multiple patients."
                );
            }

            if (ssnMatches.Count == 1)
            {
                return ssnMatches[0];
            }
        }

        return null;
    }

    private static void ApplyVisitSnapshotToPatient(
        PatientEntity patient,
        RisVisit visit,
        bool overwrite
    )
    {
        patient.FirstName = AssignPatientField(patient.FirstName, visit.PatientFirstName, overwrite);
        patient.MiddleName = AssignPatientField(patient.MiddleName, visit.PatientMiddleName, overwrite);
        patient.LastName = AssignPatientField(patient.LastName, visit.PatientLastName, overwrite);
        patient.FullName = AssignPatientField(patient.FullName, visit.PatientFullName, overwrite);
        patient.PatientName = AssignPatientField(patient.PatientName, visit.PatientName, overwrite);
        patient.LocalFirstName = AssignPatientField(patient.LocalFirstName, visit.LocalPatientFirstName, overwrite);
        patient.LocalMiddleName = AssignPatientField(patient.LocalMiddleName, visit.LocalPatientMiddleName, overwrite);
        patient.LocalLastName = AssignPatientField(patient.LocalLastName, visit.LocalPatientLastName, overwrite);
        patient.LocalOtherPatientNames = AssignPatientField(
            patient.LocalOtherPatientNames,
            visit.LocalPatientFullName,
            overwrite
        );
        patient.SSN = AssignPatientField(patient.SSN, visit.PatientSsn, overwrite);
        patient.PhoneNumber = AssignPatientField(patient.PhoneNumber, visit.PatientPhoneNumber, overwrite);
        patient.Email = AssignPatientField(patient.Email, visit.PatientEmail, overwrite);
        patient.Gender = AssignPatientField(patient.Gender, visit.PatientGender, overwrite);
        patient.DateOfBirth = overwrite
            ? visit.PatientDateOfBirth ?? patient.DateOfBirth
            : patient.DateOfBirth ?? visit.PatientDateOfBirth;
        patient.Address = AssignPatientField(patient.Address, visit.PatientAddress, overwrite);
        patient.EmergencyContactNumber = AssignPatientField(
            patient.EmergencyContactNumber,
            visit.PatientEmergencyContactNumber,
            overwrite
        );
    }

    private static string? AssignPatientField(string? currentValue, string? snapshotValue, bool overwrite)
    {
        return overwrite
            ? snapshotValue ?? currentValue
            : currentValue ?? snapshotValue;
    }

    private async Task<string?> ResolvePatientNamePartAsync(
        string? submittedValue,
        string? englishOverride,
        string? existingValue,
        Action<string> storeOriginal,
        RisTextDirection? direction,
        CancellationToken cancellationToken
    )
    {
        var overrideValue = _patientTransliteration.NormalizeLatinNamePart(englishOverride);
        var submitted = NormalizeOptionalText(submittedValue);

        if (submitted == null)
        {
            return overrideValue ?? existingValue;
        }

        var hasArabic = _patientTransliteration.ContainsArabic(submitted);
        if (hasArabic)
        {
            var original = _patientTransliteration.NormalizeOriginal(submitted);
            if (original != null)
            {
                storeOriginal(original);
            }

            if (ShouldUseArabicDictionary(direction))
            {
                return overrideValue
                    ?? await _patientTransliteration.TransliterateNamePartAsync(submitted, cancellationToken)
                    ?? existingValue;
            }

            return overrideValue ?? existingValue;
        }

        return overrideValue
            ?? _patientTransliteration.NormalizeLatinNamePart(submitted)
            ?? existingValue;
    }

    private static bool ShouldUseArabicDictionary(RisTextDirection? direction) =>
        direction is null or RisTextDirection.Auto or RisTextDirection.RTL;

    private static IQueryable<PatientEntity> WherePhoneNumberEquals(
        IQueryable<PatientEntity> patients,
        string normalizedPhoneNumber
    ) =>
        patients.Where(p => p.PhoneNumber != null
            && p.PhoneNumber.Replace(" ", "")
                .Replace("-", "")
                .Replace("(", "")
                .Replace(")", "")
                .Replace(".", "") == normalizedPhoneNumber);

    private async Task<RisVisit?> LoadVisitAsync(int visitId, CancellationToken cancellationToken)
    {
        return await _dbContext.RisVisits
            .Include(v => v.Patient)
            .Include(v => v.Documents)
            .Include(v => v.Orders)
                .ThenInclude(o => o.Prerequisites)
                    .ThenInclude(p => p.SubType)
            .FirstOrDefaultAsync(v => v.Id == visitId, cancellationToken);
    }

    private async Task<RisOrderPrerequisite> LoadPrerequisiteAsync(
        int orderId,
        int prerequisiteId,
        CancellationToken cancellationToken
    )
    {
        return await _dbContext.RisOrderPrerequisites
            .Include(p => p.Order)
                .ThenInclude(o => o!.Visit)
            .FirstOrDefaultAsync(p => p.Id == prerequisiteId && p.OrderId == orderId, cancellationToken)
            ?? throw new ArgumentException($"Prerequisite {prerequisiteId} was not found for order {orderId}.");
    }

    private async Task ReplaceOrderPrerequisitesAsync(
        RisOrder order,
        int procedureId,
        CancellationToken cancellationToken
    )
    {
        var prerequisiteIds = order.Prerequisites.Select(p => p.Id).ToList();
        var hasDocuments = await _dbContext.RisDocuments.AnyAsync(
            d => d.OrderId == order.Id
                || (d.PrerequisiteId.HasValue && prerequisiteIds.Contains(d.PrerequisiteId.Value)),
            cancellationToken
        );
        if (hasDocuments)
        {
            throw new InvalidOperationException(
                $"Procedure cannot be changed for order {order.OrderNumber} because documents are already attached."
            );
        }

        foreach (var prerequisite in order.Prerequisites.ToList())
        {
            _dbContext.RisOrderPrerequisites.Remove(prerequisite);
        }
        order.Prerequisites.Clear();

        var rules = await _dbContext.RisProcedurePrerequisiteRules
            .Include(r => r.SubType)
            .Where(r => r.ProcedureId == procedureId && r.IsActive)
            .ToListAsync(cancellationToken);

        foreach (var rule in rules)
        {
            var status = ResolveInitialPrerequisiteStatus(rule, order.Visit?.PatientGender);
            order.Prerequisites.Add(new RisOrderPrerequisite
            {
                RuleId = rule.Id,
                Type = rule.Type,
                SubTypeId = rule.SubTypeId,
                SubType = rule.SubType,
                Name = rule.Name,
                Description = rule.Description,
                RequiredGender = rule.RequiredGender,
                IsRequired = rule.IsRequired,
                Status = status,
                CompletedAtUtc = status == RisPrerequisiteStatus.Completed
                    ? DateTime.UtcNow
                    : null,
                CompletedBy = status == RisPrerequisiteStatus.Completed ? "RIS" : null,
            });
        }
    }

    private static void RefreshGenderPrerequisites(RisVisit visit)
    {
        foreach (var prerequisite in visit.Orders.SelectMany(o => o.Prerequisites))
        {
            if (prerequisite.Type != RisPrerequisiteType.Gender
                || string.IsNullOrWhiteSpace(prerequisite.RequiredGender)
                || prerequisite.Status == RisPrerequisiteStatus.Waived
                || (prerequisite.CompletedBy != null && prerequisite.CompletedBy != "RIS"))
            {
                continue;
            }

            var isSatisfied = string.Equals(
                prerequisite.RequiredGender,
                visit.PatientGender,
                StringComparison.OrdinalIgnoreCase
            );

            prerequisite.Status = isSatisfied
                ? RisPrerequisiteStatus.Completed
                : RisPrerequisiteStatus.Pending;
            prerequisite.CompletedAtUtc = isSatisfied ? DateTime.UtcNow : null;
            prerequisite.CompletedBy = isSatisfied ? "RIS" : null;
        }
    }

    private static void RefreshOrderStatus(RisOrder order)
    {
        if (order.Status is RisOrderStatus.Admitted or RisOrderStatus.StudyCreated or RisOrderStatus.Cancelled)
        {
            return;
        }

        order.Status = order.Prerequisites.Any(p => p.IsRequired && !RisPrerequisitePolicy.IsSatisfied(p))
            ? RisOrderStatus.PrerequisitesPending
            : RisOrderStatus.ReadyForAdmission;
    }

    private static void RefreshVisitStatus(RisVisit visit)
    {
        if (!CanUpdateVisit(visit.Status))
        {
            return;
        }

        ApplyVisitAggregateStatus(visit);
    }

    private static bool CanUpdateVisit(RisVisitStatus status) =>
        status is RisVisitStatus.Booked
            or RisVisitStatus.PrerequisitesPending
            or RisVisitStatus.ReadyForAdmission
            or RisVisitStatus.PartiallyAdmitted
            or RisVisitStatus.StudyCreationPending;

    private static void ApplyVisitAggregateStatus(
        RisVisit visit,
        RisVisitStatus admissionInProgressStatus = RisVisitStatus.PartiallyAdmitted
    )
    {
        var activeOrders = visit.Orders
            .Where(o => o.Status != RisOrderStatus.Cancelled)
            .ToList();

        if (activeOrders.Count == 0)
        {
            visit.Status = RisVisitStatus.Cancelled;
            return;
        }

        if (activeOrders.All(o => o.Status == RisOrderStatus.StudyCreated))
        {
            visit.Status = RisVisitStatus.StudyCreationCompleted;
            return;
        }

        if (activeOrders.Any(o => o.Status is RisOrderStatus.Admitted or RisOrderStatus.StudyCreated))
        {
            visit.Status = admissionInProgressStatus;
            return;
        }

        visit.Status = activeOrders.Any(o =>
            o.Status == RisOrderStatus.PrerequisitesPending
            || o.Prerequisites.Any(p => p.IsRequired && !RisPrerequisitePolicy.IsSatisfied(p)))
                ? RisVisitStatus.PrerequisitesPending
                : RisVisitStatus.ReadyForAdmission;
    }

    private async Task UpdateOrderReadinessAsync(int orderId, CancellationToken cancellationToken)
    {
        var order = await _dbContext.RisOrders
            .Include(o => o.Prerequisites)
            .Include(o => o.Visit)
                .ThenInclude(v => v!.Orders)
                    .ThenInclude(o => o.Prerequisites)
            .FirstOrDefaultAsync(o => o.Id == orderId, cancellationToken)
            ?? throw new ArgumentException($"RIS order {orderId} was not found.");

        if (order.Status is RisOrderStatus.StudyCreated or RisOrderStatus.Admitted)
        {
            return;
        }

        order.Status = order.Prerequisites.Any(p => p.IsRequired && !RisPrerequisitePolicy.IsSatisfied(p))
            ? RisOrderStatus.PrerequisitesPending
            : RisOrderStatus.ReadyForAdmission;

        if (order.Visit != null)
        {
            ApplyVisitAggregateStatus(order.Visit);

            if (order.Visit.Status == RisVisitStatus.ReadyForAdmission)
            {
                await _eventPublisher.EnqueueAsync(
                    RisQueues.IntegrationEvents,
                    RisEventNames.PrerequisitesCompleted,
                    new RisPrerequisitesCompletedEvent(
                        order.Visit.Id,
                        order.Visit.Orders.Select(o => o.Id).ToList()
                    ),
                    _tenantContext.EffectiveTenantId,
                    NewCorrelationId(),
                    $"ris-prerequisites-completed:{order.Visit.Id}",
                    cancellationToken
                );
            }
        }
    }

    private async Task<RisRoomDto?> GetRoomDtoAsync(int roomId, CancellationToken cancellationToken)
    {
        var room = await _dbContext.RisRooms
            .Include(r => r.Resources)
                .ThenInclude(rr => rr.RemoteNode)
            .Include(r => r.Resources)
                .ThenInclude(rr => rr.Modality)
            .AsNoTracking()
            .FirstOrDefaultAsync(r => r.Id == roomId, cancellationToken);
        return room == null ? null : ToRoomDto(room);
    }

    private static RisPrerequisiteStatus ResolveInitialPrerequisiteStatus(
        RisProcedurePrerequisiteRule rule,
        string? patientGender
    )
    {
        if (rule.Type != RisPrerequisiteType.Gender || string.IsNullOrWhiteSpace(rule.RequiredGender))
        {
            return RisPrerequisiteStatus.Pending;
        }

        return string.Equals(rule.RequiredGender, patientGender, StringComparison.OrdinalIgnoreCase)
            ? RisPrerequisiteStatus.Completed
            : RisPrerequisiteStatus.Pending;
    }

    private async Task<string> GenerateVisitNumberAsync(CancellationToken cancellationToken)
    {
        string value;
        do
        {
            value = $"RV{DateTime.UtcNow:yyyyMMddHHmmss}{Random.Shared.Next(100, 999)}";
        }
        while (await _dbContext.RisVisits.AnyAsync(v => v.VisitNumber == value, cancellationToken));

        return value;
    }

    private async Task<string> GenerateOrderNumberAsync(CancellationToken cancellationToken)
    {
        string value;
        do
        {
            value = $"RO{DateTime.UtcNow:yyMMddHHmmss}{Random.Shared.Next(10, 99)}";
        }
        while (await _dbContext.RisOrders.AnyAsync(v => v.OrderNumber == value, cancellationToken));

        return value;
    }

    private async Task<string> GeneratePatientNumberAsync(CancellationToken cancellationToken)
    {
        string value;
        do
        {
            value = $"RP{DateTime.UtcNow:yyMMddHHmmss}{Random.Shared.Next(10, 99)}";
        }
        while (await _dbContext.Patients.AnyAsync(p => p.PatientID == value || p.MRN == value, cancellationToken));

        return value;
    }

    private static RisRoomDto ToRoomDto(RisRoom room) =>
        new(
            room.Id,
            room.EntityBranchId,
            room.Code,
            room.Name,
            room.Floor,
            room.LocationDescription,
            room.Notes,
            room.Status,
            room.Resources.Select(ToRoomResourceDto).ToList()
        );

    private static RisRoomResourceDto ToRoomResourceDto(RisRoomResource resource) =>
        new(
            resource.Id,
            resource.RoomId,
            resource.Room?.Code,
            resource.Room?.Name,
            resource.RemoteNodeId,
            resource.ModalityId,
            resource.Modality?.Name ?? resource.Modality?.Type,
            resource.Code,
            resource.DisplayName,
            resource.ResourceType,
            resource.Manufacturer,
            resource.ModelName,
            resource.SerialNumber,
            resource.Notes,
            resource.SchedulingEnabled,
            resource.DefaultSlotMinutes,
            resource.Capacity,
            resource.OperationalStatus,
            resource.RemoteNode == null
                ? null
                : new RisRemoteNodeSummaryDto(
                    resource.RemoteNode.Id,
                    resource.RemoteNode.NodeCode,
                    resource.RemoteNode.AETitle,
                    resource.RemoteNode.Ip,
                    resource.RemoteNode.Port,
                    resource.RemoteNode.ModalityId
                ),
            resource.RemoteNode?.AETitle,
            resource.IsActive
        );

    private static RisSchedulingPolicyDto ToSchedulingPolicyDto(RisSchedulingPolicy policy) =>
        new(
            policy.Id,
            policy.EntityBranchId,
            policy.EnforceAvailability,
            policy.AllowOverbooking,
            policy.DefaultSlotMinutes,
            policy.DefaultCapacityPerResource
        );

    private static RisRoomResourceShiftDto ToShiftDto(RisRoomResourceShift shift) =>
        new(
            shift.Id,
            shift.RoomResourceId,
            shift.DayOfWeek,
            shift.StartTime,
            shift.EndTime,
            shift.SlotMinutes,
            shift.Capacity,
            shift.EffectiveFromUtc,
            shift.EffectiveToUtc,
            shift.IsActive
        );

    private static RisPrerequisiteSubTypeDto ToPrerequisiteSubTypeDto(
        RisPrerequisiteSubType subType
    ) =>
        new(
            subType.Id,
            subType.Type,
            subType.Code,
            subType.Name,
            subType.Description,
            subType.IsActive
        );

    private static RisInsuranceCompanyDto ToInsuranceCompanyDto(RisInsuranceCompany company) =>
        new(
            company.Id,
            company.Code,
            company.Name,
            company.ContactName,
            company.PhoneNumber,
            company.Email,
            company.Address,
            company.ContractNumber,
            company.ContractStartUtc,
            company.ContractEndUtc,
            company.PriceListId,
            company.PriceList?.Name,
            company.PriceList?.EntityBranchId,
            company.PriceList?.EntityBranch?.Name,
            company.IsActive,
            company.Notes
        );

    private static string? GetVisitPatientDisplayName(RisVisit visit) =>
        visit.Patient == null
            ? visit.PatientFullName
                ?? visit.PatientName
                ?? visit.LocalPatientFullName
                ?? visit.RequestedPatientIdentifier
            : visit.Patient.FullName
                ?? visit.Patient.PatientName
                ?? visit.Patient.PatientID;

    private static RisPatientSearchDto? ToPatientSearchDto(RisVisit visit) =>
        visit.Patient == null
            ? null
            : new RisPatientSearchDto(
                visit.Patient.Id,
                visit.Patient.PatientID,
                visit.Patient.FullName ?? visit.Patient.PatientName,
                visit.Patient.FirstName,
                visit.Patient.MiddleName,
                visit.Patient.LastName,
                visit.Patient.SSN,
                visit.Patient.PhoneNumber,
                visit.Patient.Gender,
                visit.Patient.DateOfBirth
            );

    private static RisVisitDto ToVisitDto(RisVisit visit, IReadOnlyList<string>? warnings = null) =>
        new(
            visit.Id,
            visit.VisitNumber,
            visit.PatientId,
            ToPatientSearchDto(visit),
            ToBookingPatientDto(visit),
            visit.BookingSource,
            visit.EntityBranchId,
            visit.EncounterId,
            visit.ScheduledAtUtc,
            visit.AdmittedAtUtc,
            visit.Status,
            visit.PayerType,
            visit.PaymentCategory,
            visit.InsurerName,
            visit.InsuranceCompanyId,
            visit.Orders.OrderBy(o => o.ScheduledStartUtc).Select(o => new RisOrderDto(
                o.Id,
                o.OrderNumber,
                o.ProcedureId,
                o.RoomId,
                o.RoomResourceId,
                o.StudyId,
                o.ScheduledStartUtc,
                o.ScheduledEndUtc,
                o.ScheduledStationAETitle,
                o.Status,
                o.Prerequisites.Select(p => new RisPrerequisiteDto(
                    p.Id,
                    p.RuleId,
                    p.Type,
                    p.SubTypeId,
                    p.SubType == null ? null : p.SubType.Code,
                    p.SubType == null ? null : p.SubType.Name,
                    p.Name,
                    p.IsRequired,
                    p.Status,
                    p.RequiredGender,
                    p.Description
                )).ToList()
            )).ToList(),
            visit.Documents.OrderByDescending(d => d.UploadedAtUtc).Select(d => new RisDocumentDto(
                d.Id,
                d.VisitId,
                d.OrderId,
                d.PrerequisiteId,
                d.DocumentType,
                d.FileName,
                d.ContentType,
                d.SizeBytes,
                d.UploadedAtUtc
            )).ToList(),
            warnings ?? Array.Empty<string>()
        );

    private static RisBookingPatientDto ToBookingPatientDto(RisVisit visit) =>
        new(
            visit.RequestedPatientIdentifier,
            visit.Patient == null ? visit.PatientId : visit.Patient.PatientID,
            visit.Patient == null
                ? visit.PatientFullName ?? visit.PatientName ?? visit.LocalPatientFullName
                : visit.Patient.FullName ?? visit.Patient.PatientName,
            visit.Patient == null ? visit.PatientFirstName : visit.Patient.FirstName,
            visit.Patient == null ? visit.PatientMiddleName : visit.Patient.MiddleName,
            visit.Patient == null ? visit.PatientLastName : visit.Patient.LastName,
            visit.Patient == null ? visit.LocalPatientFullName : visit.Patient.LocalOtherPatientNames,
            visit.Patient == null ? visit.LocalPatientFirstName : visit.Patient.LocalFirstName,
            visit.Patient == null ? visit.LocalPatientMiddleName : visit.Patient.LocalMiddleName,
            visit.Patient == null ? visit.LocalPatientLastName : visit.Patient.LocalLastName,
            visit.Patient == null ? visit.PatientSsn : visit.Patient.SSN,
            visit.Patient == null ? visit.PatientPhoneNumber : visit.Patient.PhoneNumber,
            visit.Patient == null ? visit.PatientEmail : visit.Patient.Email,
            visit.Patient == null ? visit.PatientGender : visit.Patient.Gender,
            visit.Patient == null ? visit.PatientDateOfBirth : visit.Patient.DateOfBirth,
            visit.Patient == null ? visit.PatientAddress : visit.Patient.Address,
            visit.Patient == null ? visit.PatientEmergencyContactNumber : visit.Patient.EmergencyContactNumber
        );

    private static string BuildFullName(string? firstName, string? middleName, string? lastName)
    {
        return string.Join(
            " ",
            new[] { firstName, middleName, lastName }.Where(v => !string.IsNullOrWhiteSpace(v))
        );
    }

    private static string? NormalizeOptionalText(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string? NormalizePhoneNumber(string? value)
    {
        var trimmed = NormalizeOptionalText(value);
        if (trimmed == null)
        {
            return null;
        }

        return new string(trimmed.Where(c => char.IsDigit(c) || c == '+').ToArray());
    }

    private static bool IsValidInternationalPhoneNumber(string value)
    {
        if (!value.StartsWith('+') || value.Count(c => c == '+') != 1)
        {
            return false;
        }

        var digits = value[1..];
        return digits.Length is >= 8 and <= 15 && digits.All(char.IsDigit);
    }

    private sealed class ProcedurePriceProjection
    {
        public int? InsuranceCompanyId { get; set; }
        public string? InsuranceCompanyName { get; set; }
        public int PriceListId { get; set; }
        public string PriceListName { get; set; } = string.Empty;
        public PriceListType PriceListType { get; set; }
        public int ProcedureId { get; set; }
        public string ProcedureName { get; set; } = string.Empty;
        public string? ProcedureCode { get; set; }
        public int ProcedurePricingId { get; set; }
        public decimal Price { get; set; }
        public decimal VatPercentage { get; set; }
        public int CurrencyId { get; set; }
        public string? CurrencyCode { get; set; }
        public string? CurrencyName { get; set; }
        public string? CurrencySymbol { get; set; }
        public string? ExternalReferenceCode { get; set; }
        public string? Notes { get; set; }
    }

    private static string NewCorrelationId() => Guid.NewGuid().ToString("N");
}
