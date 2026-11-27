using AIFit.Application.DTOs;
using AIFit.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AIFit.Api.Controllers;

[ApiController]
[Route("api/exercises")]
public class ExercisesController : ControllerBase
{
    private readonly IExerciseService _exercises;

    public ExercisesController(IExerciseService exercises)
    {
        _exercises = exercises;
    }

    /// <summary>List all exercises (Home cards + Guide page).</summary>
    [HttpGet]
    [AllowAnonymous]
    public async Task<ActionResult<List<ExerciseDto>>> GetAll()
    {
        return Ok(await _exercises.GetAllAsync());
    }

    /// <summary>Exercise detail with its enabled form rules.</summary>
    [HttpGet("{code}")]
    [AllowAnonymous]
    public async Task<ActionResult<ExerciseDetailDto>> GetByCode(string code)
    {
        return Ok(await _exercises.GetByCodeAsync(code));
    }
}
